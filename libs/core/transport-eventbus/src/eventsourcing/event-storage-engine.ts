/** One event as a store keeps it: nothing in it needs this library to be read. */
export interface StoredEvent {
  readonly identifier: string;
  /** `namespace.Name#version`. */
  readonly type: string;
  /** The event's fields, encoded for JSON — a `Date` as `{ "@date": … }`. */
  readonly payload: Record<string, unknown>;
  readonly metadata: Readonly<Record<string, string>>;
  readonly timestamp: Date;
  /** `key=value`, one per tag. */
  readonly tags: readonly string[];
}

/** A stored event, and its place in the store's one global order. */
export interface PositionedEvent extends StoredEvent {
  /** A `bigint`, as a string: the `pg` driver answers one, and nothing here has to pretend it fits a number. */
  readonly position: string;
}

/** One alternative of a criteria: every one of these tags, and one of these types when any are given. */
export interface StoredCriterion {
  readonly tags: readonly string[];
  readonly types: readonly string[];
}

/** No event matching `criteria` (none means every event) after position `after`. */
export interface StoredAppendCondition {
  readonly after: string;
  readonly criteria: readonly StoredCriterion[];
}

/** What an append answers: the position of its last event, or the refusal of its condition. */
export type AppendOutcome =
  | { readonly rejected: false; readonly last?: string }
  | { readonly rejected: true; readonly conflict?: string };

/**
 * **Where the events are kept** — Axon 5's `EventStorageEngine`, as a port. The application names the
 * implementation for its database (`MikroOrmEventStorageEngine`, `@nestposts/event-store-mikro-orm`)
 * and this library speaks messages on top of it.
 *
 * What an implementation owes, and the tests of `@nestposts/event-store-mikro-orm` hold it to:
 *
 * - {@link appendEvents} writes through `transaction` when one is given, so the events commit with the
 *   unit of work they were published in; an identifier the store already has is not appended again.
 * - With a condition, it is refused when an event matching the condition's criteria was appended
 *   after `after`. Two appends whose criteria or tags overlap must not both pass a check that each
 *   made before the other committed — the store serialises them, on the tags involved.
 * - {@link source} answers every event matching the criteria, in order.
 * - {@link readAfter} answers the global order after a position, asking again for the positions in
 *   `gaps` — a position is taken at insert and becomes visible at commit, and those are not the same
 *   order.
 */
export abstract class EventStorageEngine<Transaction = unknown> {
  abstract appendEvents(
    events: readonly StoredEvent[],
    condition: StoredAppendCondition | undefined,
    transaction?: Transaction,
  ): Promise<AppendOutcome>;

  abstract source(
    criteria: readonly StoredCriterion[],
    transaction?: Transaction,
  ): Promise<PositionedEvent[]>;

  abstract readAfter(
    position: string,
    limit: number,
    gaps?: readonly string[],
  ): Promise<PositionedEvent[]>;

  /** The last position written, `'0'` for an empty store — where a new subscriber starts. */
  abstract head(): Promise<string>;
}
