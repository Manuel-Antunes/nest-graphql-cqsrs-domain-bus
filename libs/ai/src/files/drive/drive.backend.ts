import type { StorageDisk } from '@nestjs/storage';
import type {
  BackendProtocolV2,
  EditResult,
  FileInfo,
  GlobResult,
  GrepMatch,
  GrepResult,
  LsResult,
  ReadRawResult,
  ReadResult,
  WriteResult,
} from 'deepagents';
import { lookup } from 'mime-types';

import { SidecarKeys } from '../domain/attachment-sidecar';
import { type RunConfig, RunScope } from './run-scope';

export interface DriveBackendContext {
  config?: RunConfig;
}

export interface DriveBackendOptions {
  disk: StorageDisk;
  rootPrefix: string | ((context: DriveBackendContext) => string);
  mimeOverrides?: Record<string, string>;
}

export class DriveBackend implements BackendProtocolV2 {
  private static readonly GREP_MAX_FILES = 200;
  private static readonly GREP_MAX_MATCHES = 100;
  private static readonly GREP_MAX_LINE_LENGTH = 400;
  private static readonly TEXT_MIME_TYPES = new Set([
    'application/json',
    'application/xml',
  ]);

  private readonly disk: StorageDisk;
  private readonly rootPrefixOption: DriveBackendOptions['rootPrefix'];
  private readonly mimeOverrides: Record<string, string>;

  constructor(options: DriveBackendOptions) {
    this.disk = options.disk;
    this.rootPrefixOption = options.rootPrefix;
    this.mimeOverrides = options.mimeOverrides ?? {};
  }

  async ls(path: string): Promise<LsResult> {
    try {
      const prefix = this.prefixOf(path);
      const directories = new Set<string>();
      const files: FileInfo[] = [];
      for await (const entry of this.disk.listAll({ prefix })) {
        const rest = entry.key.slice(prefix.length);
        const slash = rest.indexOf('/');
        if (slash >= 0) {
          directories.add(`${prefix}${rest.slice(0, slash)}`);
        } else {
          files.push({
            path: this.fromKey(entry.key),
            is_dir: false,
            size: entry.size,
            modified_at: entry.lastModified.toISOString(),
          });
        }
      }
      const listing = [
        ...[...directories].map((key) => ({
          path: `${this.fromKey(key)}/`,
          is_dir: true,
        })),
        ...files,
      ];
      return { files: listing.sort((a, b) => a.path.localeCompare(b.path)) };
    } catch (error) {
      return { error: `ls failed: ${DriveBackend.messageOf(error)}` };
    }
  }

  async read(
    filePath: string,
    offset?: number,
    limit?: number,
  ): Promise<ReadResult> {
    try {
      const bytes = await this.disk.getBuffer(this.toKey(filePath));
      const mimeType = this.mimeFor(filePath);
      if (!this.isText(mimeType)) {
        return { content: new Uint8Array(bytes), mimeType };
      }
      const lines = bytes.toString('utf8').split('\n');
      const start = Math.max(0, offset ?? 0);
      const end =
        typeof limit === 'number' ? start + Math.max(0, limit) : undefined;
      return { content: lines.slice(start, end).join('\n'), mimeType };
    } catch (error) {
      return {
        error: `Error: File '${filePath}' not found (${DriveBackend.messageOf(error)})`,
      };
    }
  }

  async readRaw(filePath: string): Promise<ReadRawResult> {
    try {
      const key = this.toKey(filePath);
      const bytes = await this.disk.getBuffer(key);
      const mimeType = this.mimeFor(filePath);
      const modified = await this.modifiedAt(key);
      return {
        data: {
          content: this.isText(mimeType)
            ? bytes.toString('utf8')
            : new Uint8Array(bytes),
          mimeType,
          created_at: modified,
          modified_at: modified,
        },
      };
    } catch (error) {
      return {
        error: `Error: File '${filePath}' not found (${DriveBackend.messageOf(error)})`,
      };
    }
  }

  async write(filePath: string, content: string): Promise<WriteResult> {
    try {
      await this.disk.put(this.toKey(filePath), content, {
        contentType: this.mimeFor(filePath),
      });
      return { path: filePath, filesUpdate: null };
    } catch (error) {
      return { error: `write failed: ${DriveBackend.messageOf(error)}` };
    }
  }

  async edit(
    filePath: string,
    oldString: string,
    newString: string,
    replaceAll = false,
  ): Promise<EditResult> {
    try {
      const key = this.toKey(filePath);
      const current = await this.disk.getText(key);
      const occurrences = current.split(oldString).length - 1;
      if (occurrences === 0) {
        return { error: `Error: oldString not found in '${filePath}'` };
      }
      if (!replaceAll && occurrences > 1) {
        return {
          error: `Error: oldString matches multiple occurrences in '${filePath}'. Pass replaceAll=true or use a more specific oldString.`,
        };
      }
      const next = replaceAll
        ? current.split(oldString).join(newString)
        : current.replace(oldString, newString);
      await this.disk.put(key, next, { contentType: this.mimeFor(filePath) });
      return {
        path: filePath,
        filesUpdate: null,
        occurrences: replaceAll ? occurrences : 1,
      };
    } catch (error) {
      return { error: `edit failed: ${DriveBackend.messageOf(error)}` };
    }
  }

  async glob(pattern: string, path = '/'): Promise<GlobResult> {
    try {
      const regex = DriveBackend.globToRegex(pattern);
      const files: FileInfo[] = [];
      for await (const entry of this.disk.listAll({
        prefix: this.prefixOf(path),
      })) {
        const relative = this.fromKey(entry.key);
        if (DriveBackend.matchesGlob(regex, relative)) {
          files.push({ path: relative, is_dir: false });
        }
      }
      return { files: files.sort((a, b) => a.path.localeCompare(b.path)) };
    } catch (error) {
      return { error: `glob failed: ${DriveBackend.messageOf(error)}` };
    }
  }

  async grep(
    pattern: string,
    path = '/',
    glob: string | null = null,
  ): Promise<GrepResult> {
    const matcher = DriveBackend.safeRegex(pattern);
    const globRegex = glob ? DriveBackend.globToRegex(glob) : null;
    try {
      const matches: GrepMatch[] = [];
      let scanned = 0;
      for await (const entry of this.disk.listAll({
        prefix: this.prefixOf(path),
      })) {
        if (
          matches.length >= DriveBackend.GREP_MAX_MATCHES ||
          scanned >= DriveBackend.GREP_MAX_FILES
        ) {
          break;
        }
        const relative = this.fromKey(entry.key);
        if (globRegex && !DriveBackend.matchesGlob(globRegex, relative))
          continue;
        if (!this.isText(this.mimeFor(relative))) continue;
        scanned += 1;
        const text = await this.disk.getText(entry.key).catch(() => undefined);
        if (text === undefined) continue;
        const lines = text.split('\n');
        for (let index = 0; index < lines.length; index++) {
          if (!matcher.test(lines[index])) continue;
          matches.push({
            path: relative,
            line: index + 1,
            text: lines[index].slice(0, DriveBackend.GREP_MAX_LINE_LENGTH),
          });
          if (matches.length >= DriveBackend.GREP_MAX_MATCHES) break;
        }
      }
      return { matches };
    } catch (error) {
      return { error: `grep failed: ${DriveBackend.messageOf(error)}` };
    }
  }

  private get rootPrefix(): string {
    const raw =
      typeof this.rootPrefixOption === 'function'
        ? this.rootPrefixOption({ config: RunScope.config() })
        : this.rootPrefixOption;
    return SidecarKeys.trim(raw);
  }

  private toKey(path: string): string {
    const relative = path.replace(/^\/+/, '');
    const root = this.rootPrefix;
    return root ? `${root}/${relative}` : relative;
  }

  private prefixOf(path: string): string {
    const key = this.toKey(path).replace(/\/+$/, '');
    return key ? `${key}/` : '';
  }

  private fromKey(key: string): string {
    const root = this.rootPrefix;
    const relative =
      root && key.startsWith(`${root}/`) ? key.slice(root.length + 1) : key;
    return `/${relative.replace(/^\/+/, '')}`;
  }

  private async modifiedAt(key: string): Promise<string> {
    try {
      return (await this.disk.stat(key)).lastModified.toISOString();
    } catch {
      return new Date().toISOString();
    }
  }

  private mimeFor(path: string): string {
    const extension = (path.split('.').pop() ?? '').toLowerCase();
    if (this.mimeOverrides[extension]) return this.mimeOverrides[extension];
    if (SidecarKeys.isSidecar(path.toLowerCase())) return 'application/json';
    return lookup(path) || 'application/octet-stream';
  }

  private isText(mimeType: string): boolean {
    return (
      mimeType.startsWith('text/') || DriveBackend.TEXT_MIME_TYPES.has(mimeType)
    );
  }

  private static globToRegex(pattern: string): RegExp {
    const source = pattern.replace(/^\/+/, '');
    let regex = '^';
    for (let index = 0; index < source.length; index++) {
      const char = source[index];
      if (char === '*' && source[index + 1] === '*') {
        if (source[index + 2] === '/') {
          regex += '(?:.*/)?';
          index += 2;
        } else {
          regex += '.*';
          index += 1;
        }
      } else if (char === '*') {
        regex += '[^/]*';
      } else if (char === '?') {
        regex += '[^/]';
      } else if ('.+^$(){}|[]\\'.includes(char)) {
        regex += `\\${char}`;
      } else {
        regex += char;
      }
    }
    return new RegExp(`${regex}$`, 'i');
  }

  private static matchesGlob(regex: RegExp, backendPath: string): boolean {
    const relative = backendPath.replace(/^\/+/, '');
    const base = relative.split('/').pop() ?? relative;
    return regex.test(relative) || regex.test(base);
  }

  private static safeRegex(pattern: string): RegExp {
    try {
      return new RegExp(pattern, 'i');
    } catch {
      return new RegExp(pattern.replace(/[.*+^${}()|[\]\\]/g, '\\$&'), 'i');
    }
  }

  private static messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
