/** Inngest takes at most five session entries on one event. */
export const MAX_SESSIONS = 5;

/** The per-event knobs Inngest has, and the envelope has no reason to know about. */
export interface InngestRecordOptions {
  /**
   * Extra entries for the event's `user` object — the slot Inngest gives whatever should travel
   * beside the data, and where this transport puts the envelope's metadata. Headers, in other words.
   */
  readonly user?: Record<string, string>;
  /**
   * Extra envelope **metadata**, merged into the flat map the far side reads back as the request's
   * attributes. It is the transport-agnostic half of a record: what is written here survives every
   * hop, on any transport.
   */
  readonly metadata?: Record<string, string>;
  /**
   * Inngest **sessions**: `{ key: id }`, at most {@link MAX_SESSIONS} of them. They group runs in
   * Inngest's own dashboard and change nothing about which function runs — and, from inngest-js
   * 4.18, they propagate by themselves to every event a run sends, which is what makes a whole saga
   * one thing to look at. This transport already puts the request's correlation id there; this is
   * for whatever else a caller wants grouped.
   */
  readonly sessions?: Record<string, string | number>;
  /**
   * What makes two sends the same send. It becomes the event's `id` (`<name>:<key>`), and Inngest
   * collapses repeated sends of one id into a single run inside its deduplication window.
   */
  readonly idempotencyKey?: string;
  /** When the event should be considered to have happened — Inngest's `ts`, which also delays a run. */
  readonly ts?: number | Date;
}

const INNGEST_RECORD = Symbol.for('nestposts.transport-eventbus.inngest-record');

/** A payload with Inngest options attached — the shape {@link InngestRecordBuilder} builds. */
export interface InngestRecord<TData = unknown> {
  readonly data: TData;
  readonly options: InngestRecordOptions;
}

/**
 * Whether a payload carries Inngest options. A marker symbol and not a duck-typed `'options' in
 * value`, because a domain event with a property called `options` is not a transport instruction.
 */
export const isInngestRecord = <TData>(value: unknown): value is InngestRecord<TData> =>
  typeof value === 'object' &&
  value !== null &&
  (value as Record<symbol, unknown>)[INNGEST_RECORD] === true;

/**
 * **Inngest's own options, attached to one send** — the counterpart of `SqsRecordBuilder`,
 * `SnsRecordBuilder` and Nest's `RmqRecordBuilder`, and the same idea: the caller composes transport
 * options without the producer learning the transport.
 *
 * A domain event needs none of this. The forwarder emits an envelope and
 * {@link InngestEventEnvelopeSerializer} fills the name, the data, the `user` and the correlation
 * session from what the event already carries. What this is for is the send a service makes **on
 * purpose**: one that must not run twice, one that should not run yet, one that belongs to a session
 * of its own.
 *
 * ```ts
 * client.emit(pattern, new InngestRecordBuilder(payload)
 *   .setIdempotencyKey(`sync:${caseId}`)
 *   .setSession('conversation_id', conversationId)
 *   .build());
 * ```
 */
export class InngestRecordBuilder<TData = unknown> {
  private options: InngestRecordOptions = {};

  constructor(private readonly data: TData) {}

  setOptions(options: InngestRecordOptions): this {
    this.options = { ...this.options, ...options };
    return this;
  }

  setUser(user: Record<string, string>): this {
    this.options = { ...this.options, user: { ...(this.options.user ?? {}), ...user } };
    return this;
  }

  setMetadata(metadata: Record<string, string>): this {
    this.options = { ...this.options, metadata: { ...(this.options.metadata ?? {}), ...metadata } };
    return this;
  }

  setSessions(sessions: Record<string, string | number>): this {
    const merged = { ...(this.options.sessions ?? {}), ...sessions };
    if (Object.keys(merged).length > MAX_SESSIONS) {
      throw new Error(
        `Inngest takes at most ${MAX_SESSIONS} sessions on one event; ` +
          `this one would carry ${Object.keys(merged).length} (${Object.keys(merged).join(', ')}).`,
      );
    }
    this.options = { ...this.options, sessions: merged };
    return this;
  }

  setSession(key: string, id: string | number): this {
    return this.setSessions({ [key]: id });
  }

  setIdempotencyKey(idempotencyKey: string): this {
    return this.setOptions({ idempotencyKey });
  }

  setTimestamp(ts: number | Date): this {
    return this.setOptions({ ts });
  }

  build(): InngestRecord<TData> {
    return { data: this.data, options: this.options, [INNGEST_RECORD]: true } as InngestRecord<TData>;
  }
}
