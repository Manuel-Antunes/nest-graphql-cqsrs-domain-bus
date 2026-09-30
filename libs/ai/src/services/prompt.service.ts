import { Inject, Injectable, Logger } from '@nestjs/common';
import { LangfuseClient } from '@langfuse/client';

/**
 * How long the Langfuse SDK caches a fetched prompt locally before it
 * re-checks the API. 5 min strikes the balance between propagating
 * edits quickly and keeping per-turn latency near zero.
 */
const DEFAULT_CACHE_TTL_SECONDS = 300;

/**
 * Hard cap on a single fetch round-trip. The cache means most calls don't
 * touch the network at all; this only fires on cache misses (first hit per
 * Lambda warm window or after TTL expiry). Keep low so a Langfuse outage
 * can't stall a turn — on timeout the fallback kicks in.
 */
const DEFAULT_FETCH_TIMEOUT_MS = 3000;

/**
 * Thin wrapper around `LangfuseClient.getPrompt` with workspace-specific
 * defaults (cache TTL, timeout, environment label) and silent-fallback
 * semantics. Callers always receive a usable string — if Langfuse is
 * unreachable or the prompt name is missing, the hardcoded fallback wins
 * and a warning is logged.
 *
 * The Langfuse SDK already handles the TTL cache internally, so this
 * service stays stateless on top.
 */
@Injectable()
export class PromptService {
  private readonly logger = new Logger(PromptService.name);
  private readonly label: string;

  constructor(
    @Inject(LangfuseClient) private readonly langfuse: LangfuseClient,
  ) {
    // Stage label matches the deploy environment so develop/staging/
    // production can iterate on prompts independently in the Langfuse UI.
    this.label =
      process.env['LANGFUSE_PROMPT_LABEL'] ||
      process.env['DEPLOY_ENV'] ||
      'production';
  }

  /**
   * Fetch a plain-text prompt. If `variables` is provided, the result is
   * compiled with `{{var}}` substitution; otherwise the raw template is
   * returned verbatim.
   *
   * Returns the `fallback` on any failure (network, missing prompt,
   * timeout) — callers never need to handle errors themselves.
   */
  async getText(
    name: string,
    fallback: string,
    variables?: Record<string, string>,
  ): Promise<string> {
    if (process.env.DISABLE_LANGFUSE === 'true') {
      return variables ? interpolate(fallback, variables) : fallback;
    }
    try {
      const prompt = await this.langfuse.prompt.get(name, {
        type: 'text',
        label: this.label,
        cacheTtlSeconds: DEFAULT_CACHE_TTL_SECONDS,
        fetchTimeoutMs: DEFAULT_FETCH_TIMEOUT_MS,
        fallback,
      });
      // `prompt.compile()` with no variables still returns the raw template,
      // so this branch handles both "compile with vars" and "give me raw".
      return variables ? prompt.compile(variables) : prompt.compile();
    } catch (error) {
      this.logger.warn(
        `[getText] "${name}" failed — using hardcoded fallback (${this.errMsg(error)})`,
      );
      return variables ? interpolate(fallback, variables) : fallback;
    }
  }

  private errMsg(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}

/**
 * Minimal `{{var}}` interpolation used by the fallback path so the same
 * substitution behavior holds whether the prompt came from Langfuse or
 * from the hardcoded constant. Mirrors Langfuse's compile semantics:
 * unknown placeholders are left intact.
 */
function interpolate(
  template: string,
  variables: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(variables, key)
      ? variables[key]
      : match,
  );
}
