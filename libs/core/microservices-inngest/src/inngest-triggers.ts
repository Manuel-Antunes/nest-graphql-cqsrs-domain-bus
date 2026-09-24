/** Inngest takes at most ten unique triggers on one function. */
export const MAX_TRIGGERS = 10;

const ONE_SEGMENT = '.*';

/**
 * **How a handler's pattern becomes the event names Inngest can trigger on.** Inngest matches a
 * trigger by exact name and has no wildcards, so whatever a pattern stands for has to be spelled out
 * when the functions are created.
 */
export type InngestTriggerResolver = (pattern: string) => string[];

/**
 * The resolution that needs nothing but the pattern:
 *
 * | the `@EventPattern` | the triggers |
 * |---|---|
 * | `posts.PostCreated` | itself |
 * | `posts.PostCreated.*` | `posts.PostCreated` — the aggregate segment a queue would match |
 * | `posts.#`, `posts.*.p-1` | none: a namespace is a list only a registry can write |
 *
 * A service whose events are declared somewhere this strategy cannot see passes a resolver of its own
 * — `@nestposts/transport-eventbus`'s `inngestTriggers` reads the `@EventType` registry.
 */
export const literalTriggers: InngestTriggerResolver = (pattern) => {
  const name = pattern.endsWith(ONE_SEGMENT)
    ? pattern.slice(0, -ONE_SEGMENT.length)
    : pattern;
  return name.includes('#') || name.includes('*') ? [] : [name];
};

const isLiteral = (pattern: string): boolean =>
  !pattern.includes('#') && !pattern.includes('*');

/**
 * **Each event name goes to ONE function: the most specific binding that asked for it.**
 *
 * On a broker a queue receives one copy of a message however many of its bindings match, and the
 * server hands it to one handler. On Inngest every function whose triggers include a name gets a run
 * of its own — so a service bound to both `posts.#` and `posts.PostCreated.*` would handle every
 * `posts.PostCreated` twice. Claiming the name for one pattern is what keeps the two the same thing:
 * a literal pattern first, then the one that stands for fewer names, then registration order.
 */
export const claimTriggers = (
  patterns: readonly string[],
  resolve: InngestTriggerResolver,
): Map<string, string[]> => {
  const resolved = new Map(
    patterns.map((pattern) => [pattern, resolve(pattern)] as const),
  );
  const breadthOf = (pattern: string): number =>
    isLiteral(pattern) ? -1 : (resolved.get(pattern)?.length ?? 0);
  const ordered = [...patterns].sort(
    (left, right) => breadthOf(left) - breadthOf(right),
  );
  const claimed = new Map<string, string>();
  for (const pattern of ordered) {
    for (const name of resolved.get(pattern) ?? []) {
      if (!claimed.has(name)) {
        claimed.set(name, pattern);
      }
    }
  }
  return new Map(
    patterns.map((pattern) => [
      pattern,
      (resolved.get(pattern) ?? []).filter(
        (name) => claimed.get(name) === pattern,
      ),
    ]),
  );
};

/** A function id Inngest accepts, derived from the pattern it was bound for. */
export const inngestFunctionId = (pattern: string): string =>
  pattern
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
