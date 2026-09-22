export interface HandlerOptions {
  /**
   * **Work that was started and has to finish before the handler answers.**
   *
   * Nothing in this repository passes one any more, and the story of why is worth the field staying
   * here rather than the field being the story. A Lambda that returns with
   * `callbackWaitsForEmptyEventLoop` off is frozen on the spot, so anything merely *started* — a row
   * appended to the event log, a command a saga dispatched — does not continue. It is not slow, it
   * never happens, and the only symptom is somewhere else.
   *
   * Chasing those loose ends from the handler was the first answer and the wrong one: it can only
   * catch what it was told about. `UnitOfWork` (`@nestposts/cqsrs`) is the right one — a command and
   * an ingested message each run in a unit, whatever they set off registers on it, and the unit does
   * not commit until all of it is done. The handler's `await` already covers the chain, so there is
   * nothing left to drain.
   */
  readonly drain?: () => Promise<void>;
}

/**
 * **What a handler finishes before it answers.**
 *
 * Telemetry is deliberately **not** in here. It used to be — `flushTelemetry()` on every invocation
 * — because a batch processor holding spans in process loses them when the container freezes. The
 * collector extension moves that problem to where it belongs: the SDK exports each span to
 * `localhost` as it ends, the collector batches and retries, and the Lambda runtime tells the
 * extension when the invocation is over.
 *
 * And the application's own unfinished work is not in here either, for the reason above. What is
 * left is a hook nothing needs, kept because the next thing that cannot be awaited will want it.
 */
export const settle = async (options: HandlerOptions): Promise<void> => {
  await options.drain?.().catch(() => undefined);
};
