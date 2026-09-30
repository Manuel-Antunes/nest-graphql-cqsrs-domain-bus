/**
 * Minimal in-memory backend for serving a fixed set of text files
 * (typically Agent Skills SKILL.md content baked into the bundle).
 *
 * Why a dedicated backend instead of the deepagents docs' "inject via
 * `files` state input" pattern: in our setup the state-channel merge
 * silently dropped the files (see `[skill-probe] files=0` in
 * production logs even though we injected `files: skillFiles` on
 * every invoke). The most likely cause is the SkillsMiddleware's
 * `beforeAgent` running before the input reducer applies our files,
 * but rather than fighting hook-ordering issues, we mount this
 * backend at a CompositeBackend route (e.g. `/skills`) so the
 * SkillsMiddleware reads from a stable, always-available source.
 *
 * Implements only the subset of BackendProtocolV2 the SkillsMiddleware
 * touches (`ls`, `read`, `readRaw`). Other ops (`write`, `edit`, etc.)
 * return errors — these files are read-only by design.
 */

import { Logger } from '@nestjs/common';

const MIME_TEXT_MARKDOWN = 'text/markdown';

interface InMemoryFile {
  /** Raw file content (text). */
  content: string;
  /** ISO timestamp set at backend construction. */
  modifiedAt: string;
}

/**
 * Constructor input: a record keyed by ABSOLUTE virtual path inside the
 * route the backend is mounted at. When mounted at `/skills` via
 * CompositeBackend, a key of `/attach-document/SKILL.md` here is
 * reachable as `/skills/attach-document/SKILL.md` from the agent.
 */
export class StaticFilesBackend {
  private readonly logger = new Logger('StaticFilesBackend');
  private readonly files: Map<string, InMemoryFile>;
  private readonly createdAt: string;

  constructor(files: Record<string, string>) {
    this.createdAt = new Date().toISOString();
    this.files = new Map();
    for (const [path, content] of Object.entries(files)) {
      this.files.set(canonicalize(path), {
        content,
        modifiedAt: this.createdAt,
      });
    }
    this.logger.log(
      `initialized with ${this.files.size} file(s): [${Array.from(this.files.keys()).join(', ')}]`,
    );
  }

  /**
   * Non-recursive listing — returns immediate children of `path` (files
   * and subdirectories). Matches the contract of
   * `BackendProtocolV2.ls`, which is the only behavior the
   * SkillsMiddleware depends on.
   */
  async ls(path: string): Promise<{
    files?: Array<{
      path: string;
      is_dir: boolean;
      size: number;
      modified_at: string;
    }>;
    error?: string;
  }> {
    // Canonicalize FIRST — CompositeBackend's prefix stripping yields
    // `//` for `ls('/skills/')` (suffix is `/`, then `'/' + suffix` =
    // `//`), which our key-prefix match would otherwise miss.
    const normalizedRaw = canonicalize(path);
    const normalized = normalizedRaw.endsWith('/')
      ? normalizedRaw
      : `${normalizedRaw}/`;
    const infos: Array<{
      path: string;
      is_dir: boolean;
      size: number;
      modified_at: string;
    }> = [];
    const subdirs = new Set<string>();
    for (const [key, file] of this.files) {
      if (!key.startsWith(normalized)) continue;
      const relative = key.slice(normalized.length);
      if (relative.includes('/')) {
        const subdir = relative.split('/')[0];
        subdirs.add(`${normalized}${subdir}/`);
        continue;
      }
      infos.push({
        path: key,
        is_dir: false,
        size: file.content.length,
        modified_at: file.modifiedAt,
      });
    }
    for (const subdir of Array.from(subdirs).sort()) {
      infos.push({
        path: subdir,
        is_dir: true,
        size: 0,
        modified_at: '',
      });
    }
    infos.sort((a, b) => a.path.localeCompare(b.path));
    this.logger.log(
      `ls('${path}') → normalized='${normalized}' → ${infos.length} entries: [${infos.map((i) => i.path).join(', ')}]`,
    );
    return { files: infos };
  }

  async read(
    filePath: string,
    offset = 0,
    limit = 500,
  ): Promise<{ content?: string; mimeType?: string; error?: string }> {
    const file = this.files.get(canonicalize(filePath));
    if (!file) return { error: `File '${filePath}' not found` };
    const lines = file.content.split('\n');
    return {
      content: lines.slice(offset, offset + limit).join('\n'),
      mimeType: MIME_TEXT_MARKDOWN,
    };
  }

  async readRaw(filePath: string): Promise<{
    data?: {
      content: string;
      mimeType: string;
      created_at: string;
      modified_at: string;
    };
    error?: string;
  }> {
    const file = this.files.get(canonicalize(filePath));
    if (!file) return { error: `File '${filePath}' not found` };
    return {
      data: {
        content: file.content,
        mimeType: MIME_TEXT_MARKDOWN,
        created_at: this.createdAt,
        modified_at: file.modifiedAt,
      },
    };
  }

  /**
   * Batch-download files as raw bytes. The deepagents `SkillsMiddleware`
   * prefers this over `read()` when available — its absence on the routed
   * backend made `CompositeBackend.downloadFiles` throw
   * `"Backend does not support downloadFiles"`, which silently zeroed
   * the loaded-skills index in production. Implementing it (even minimally)
   * unblocks skill discovery.
   *
   * The `error` field is the deepagents `FileOperationError` union
   * (`"file_not_found" | "permission_denied" | "is_directory" |
   * "invalid_path"`). Inlined as a literal string union here so this
   * file stays free of a direct deepagents type import.
   */
  async downloadFiles(paths: string[]): Promise<
    Array<{
      path: string;
      content: Uint8Array | null;
      error: 'file_not_found' | null;
    }>
  > {
    const encoder = new TextEncoder();
    const result = paths.map((path) => {
      const canon = canonicalize(path);
      const file = this.files.get(canon);
      if (!file) {
        return {
          path,
          content: null,
          error: 'file_not_found' as const,
        };
      }
      return {
        path,
        content: encoder.encode(file.content),
        error: null,
      };
    });
    this.logger.log(
      `downloadFiles([${paths.join(', ')}]) → ${result
        .map(
          (r) =>
            `${r.path}: ${r.error ?? (r.content ? `${r.content.byteLength}B` : 'null')}`,
        )
        .join(' | ')}`,
    );
    return result;
  }

  // Write ops are intentionally rejected — the bundle is read-only.
  async write(): Promise<{ error: string }> {
    return { error: 'StaticFilesBackend is read-only' };
  }
  async edit(): Promise<{ error: string }> {
    return { error: 'StaticFilesBackend is read-only' };
  }
  async grep(): Promise<{
    error?: string;
    matches?: Array<{ path: string; line: number; text: string }>;
  }> {
    // SkillsMiddleware doesn't need grep — return empty matches for
    // safety so any defensive caller gets a no-op rather than an
    // error.
    return { matches: [] };
  }
  async glob(): Promise<{
    error?: string;
    files?: Array<{
      path: string;
      is_dir: boolean;
      size: number;
      modified_at: string;
    }>;
  }> {
    return { files: [] };
  }
}

/**
 * Collapse repeated slashes and guarantee a leading slash, so that
 * `'//foo'` / `'/foo'` / `'foo'` all canonicalize to the same key.
 *
 * Why: `CompositeBackend.ls('/skills/')` computes `searchPath = '/' +
 * '/' = '//'` and forwards that to the routed backend. Without this
 * normalization our key-prefix match would never hit any stored entry
 * for the most common SkillsMiddleware ls call.
 */
function canonicalize(input: string): string {
  const collapsed = input.replace(/\/+/g, '/');
  return collapsed.startsWith('/') ? collapsed : `/${collapsed}`;
}
