import type { StructuredToolInterface } from '@langchain/core/tools';
import type { MultiServerMCPClient } from '@langchain/mcp-adapters';
import { Logger, type OnModuleDestroy } from '@nestjs/common';

interface PoolEntry {
  client?: MultiServerMCPClient;
  tools: StructuredToolInterface[];
  healthy: boolean;
}

export interface McpClientPoolOptions {
  /** Logger label, e.g. `LegalMcp` / `ChatMcp`. */
  label: string;
  /** Server name passed to `client.getTools(serverKey)`. */
  serverKey: string;
  /**
   * Builds a FRESH client for `key`. `onError` must be wired to the client's
   * `onConnectionError` so the pool can mark the entry unhealthy and reconnect
   * on the next borrow. For the legal stdio MCP `key` is the tenant id (it's
   * baked into the spawned child's env); for the tenant-agnostic chat HTTP MCP
   * it's the fixed `'default'`.
   */
  build: (key: string, onError: () => void) => MultiServerMCPClient;
  /**
   * Optional hook run once a client has connected and loaded its tools — used by
   * the legal stdio pool to pipe the child's stderr into the logger. Best-effort.
   */
  afterConnect?: (client: MultiServerMCPClient, key: string) => void | Promise<void>;
  /**
   * Ceiling on a single connect+list-tools attempt, in ms.
   *
   * Without it a borrow inherits the MCP SDK's own ~60s request timeout. That is
   * paid on the BOOT path — `A2aRegistry.onModuleInit` resolves the A2A agent
   * providers, which construct agents that inject these tools — so a slow or
   * broken MCP server held the gateway a full minute before it could listen.
   * Failing fast is free: the pool already degrades to `[]` and reconnects on the
   * next borrow.
   */
  connectTimeoutMs?: number;
}

/** Default connect ceiling; override per pool or via `MCP_CONNECT_TIMEOUT_MS`. */
const DEFAULT_CONNECT_TIMEOUT_MS = 15_000;

/**
 * Long-lived pool of `MultiServerMCPClient`s, keyed by an arbitrary string, that
 * is REUSED across requests and reconnects on demand.
 *
 * WHY THIS EXISTS — the providers that expose MCP tools were `Scope.REQUEST` and
 * built a NEW client per request. For the legal stdio MCP that spawned a fresh
 * `legal-mcp.js` child (~350 MB, a full NestJS app) on EVERY message and never
 * closed it: request-scoped providers do NOT get `onModuleDestroy` per request
 * in NestJS (the hook only fires at app shutdown, on the static-context
 * instance), and the per-context instances are merely WeakMap-held — GC reclaims
 * the JS object but does NOT kill the spawned OS process. So the orphaned
 * children piled up until the container hit `Runtime.OutOfMemory`.
 *
 * Pooling owns the client lifecycle EXPLICITLY instead of leaning on the DI
 * scope: one healthy client per key is reused (no per-request spawn, no leak);
 * an unhealthy/empty client is torn down and reconnected on the next borrow (so
 * a slow/failed boot can't poison the container for life); and every client is
 * closed on shutdown. The pool is a singleton, so its `onModuleDestroy` DOES
 * fire.
 */
export class McpClientPool implements OnModuleDestroy {
  private readonly logger: Logger;
  private readonly entries = new Map<string, PoolEntry>();
  private readonly inflight = new Map<string, Promise<StructuredToolInterface[]>>();

  constructor(private readonly opts: McpClientPoolOptions) {
    this.logger = new Logger(opts.label);
  }

  /**
   * Returns the tool set for `key`, reusing a healthy pooled client or
   * (re)connecting on demand. Concurrent borrows for the same key share one
   * in-flight connect.
   *
   * The tools are wrapped with {@link recoverable} so a mid-call session loss
   * self-heals (see below) — callers always get session-resilient tools.
   */
  async getTools(key = 'default'): Promise<StructuredToolInterface[]> {
    return this.wrap(key, await this.getToolsRaw(key));
  }

  /** The raw (unwrapped) pooled tools — used internally for the recovery retry. */
  private async getToolsRaw(key: string): Promise<StructuredToolInterface[]> {
    const entry = this.entries.get(key);
    if (entry?.healthy && entry.tools.length) return entry.tools;

    const existing = this.inflight.get(key);
    if (existing) return existing;

    const pending = this.reconnect(key).finally(() => this.inflight.delete(key));
    this.inflight.set(key, pending);
    return pending;
  }

  /** Force the next borrow for `key` to reconnect (e.g. after a tool-call failure). */
  markUnhealthy(key = 'default'): void {
    const entry = this.entries.get(key);
    if (entry) entry.healthy = false;
  }

  /**
   * A streamable-HTTP MCP server can drop/expire OUR session out from under a
   * long-lived pooled client (restart, idle TTL, redeploy). This surfaces two
   * ways, BOTH as a TOOL error (caught by the agent's tool-error-boundary), NOT
   * as `onConnectionError` — so `markUnhealthy` never fires on its own and the
   * pool keeps handing out dead tools for the rest of the container's life,
   * turning every subsequent MCP call into a "limitação técnica":
   *   1. the next call POSTs a stale `mcp-session-id` → `404 Session not found`;
   *   2. the transport was torn down → the SDK's `Protocol.request` guard throws
   *      a bare `Error: Not connected` (or `connection/transport closed`).
   * Match BOTH here so the wrapper reconnects and retries. (Only MCP tool calls
   * flow through this pool, so "not connected" here is unambiguously the MCP
   * transport, never e.g. a DB connection.)
   */
  private isSessionError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return /session not found|session.*expired|invalid session|no valid session|mcp-session-id|not connected|(connection|transport) closed/i.test(
      message,
    );
  }

  /** Wrap each tool so a session loss reconnects + retries the call once. */
  private wrap(
    key: string,
    rawTools: StructuredToolInterface[],
  ): StructuredToolInterface[] {
    return rawTools.map((raw) => this.recoverable(key, raw));
  }

  /**
   * Proxy `tool.invoke` so a {@link isSessionError} failure transparently marks
   * the pool unhealthy, reconnects (fresh session), and retries the SAME call
   * ONCE on the freshly-borrowed tool. The retry uses the RAW tool (not another
   * wrapper) so a still-broken session fails fast instead of looping. Every
   * other property/method passes straight through to the underlying tool, so
   * name/description/schema and `instanceof` are unaffected.
   */
  private recoverable(
    key: string,
    raw: StructuredToolInterface,
  ): StructuredToolInterface {
    return new Proxy(raw, {
      // An ARROW trap, so `this` stays lexically the pool. A plain method here
      // would shadow it and force aliasing `const pool = this`.
      get: (target, prop, receiver) => {
        if (prop !== 'invoke') return Reflect.get(target, prop, receiver);
        return async (input: unknown, config?: unknown) => {
          try {
            return await (target as unknown as {
              invoke: (i: unknown, c?: unknown) => Promise<unknown>;
            }).invoke(input, config);
          } catch (error) {
            if (!this.isSessionError(error)) throw error;
            this.logger.warn(
              `${this.opts.label} MCP session lost on tool '${target.name}' [key=${key}] — reconnecting and retrying once`,
            );
            this.markUnhealthy(key);
            const fresh = (await this.getToolsRaw(key)).find(
              (t) => t.name === target.name,
            );
            if (!fresh) throw error;
            return await (fresh as unknown as {
              invoke: (i: unknown, c?: unknown) => Promise<unknown>;
            }).invoke(input, config);
          }
        };
      },
    });
  }

  /**
   * Races a connect against {@link McpClientPoolOptions.connectTimeoutMs}. The
   * timer is always cleared, so a fast connect never holds the event loop open
   * (which would keep a serverless sandbox alive past its response).
   */
  private async withConnectTimeout<T>(pending: Promise<T>): Promise<T> {
    // `Number(undefined)` is NaN — not nullish — so the env value is validated
    // explicitly rather than chained through `??`.
    const fromEnv = Number(process.env['MCP_CONNECT_TIMEOUT_MS']);
    const ms =
      this.opts.connectTimeoutMs ??
      (Number.isFinite(fromEnv) ? fromEnv : DEFAULT_CONNECT_TIMEOUT_MS);
    // A non-positive value explicitly disables the ceiling.
    if (!Number.isFinite(ms) || ms <= 0) return pending;

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        pending,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(
                  `connect timed out after ${ms}ms (MCP_CONNECT_TIMEOUT_MS)`,
                ),
              ),
            ms,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private async reconnect(key: string): Promise<StructuredToolInterface[]> {
    // Tear down a previous (unhealthy) client first so its child/sockets don't
    // leak when we replace it.
    await this.entries.get(key)?.client?.close().catch(() => undefined);

    const client = this.opts.build(key, () => this.markUnhealthy(key));
    try {
      const tools = await this.withConnectTimeout(
        client.getTools(this.opts.serverKey),
      );
      this.entries.set(key, { client, tools, healthy: tools.length > 0 });
      this.logger.log(
        `${this.opts.label} ready [key=${key}] tools(${tools.length}): ${tools
          .map((t) => t.name)
          .join(', ')}`,
      );
      try {
        await this.opts.afterConnect?.(client, key);
      } catch {
        /* best-effort observability hook — never fail a connect over it */
      }
      return tools;
    } catch (error) {
      await client.close().catch(() => undefined);
      this.entries.set(key, { client: undefined, tools: [], healthy: false });
      this.logger.error(
        `${this.opts.label} connect failed [key=${key}]: ${
          error instanceof Error ? error.message : String(error)
        } — will retry on next borrow.`,
      );
      return [];
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(
      [...this.entries.values()].map((e) =>
        e.client?.close().catch(() => undefined),
      ),
    );
    this.entries.clear();
  }
}
