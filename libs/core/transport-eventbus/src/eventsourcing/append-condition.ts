import { EventCriteria } from './event-criteria';

/**
 * **How far a decision read** — Axon 5's `ConsistencyMarker`: a position in the store's global
 * order. `ORIGIN` is before the first event; `INFINITY` means "do not check".
 *
 * A marker is the position of the last event a decision saw among those its criteria match, so an
 * event appended after it that matches the same criteria is one the decision did not know about.
 */
export class ConsistencyMarker {
  static readonly ORIGIN = new ConsistencyMarker(0n);
  static readonly INFINITY = new ConsistencyMarker(null);

  private constructor(private readonly value: bigint | null) {}

  static at(position: string | bigint): ConsistencyMarker {
    return new ConsistencyMarker(BigInt(position));
  }

  get isInfinity(): boolean {
    return this.value === null;
  }

  /** The position, as the store's `bigint` in a string; `undefined` for {@link INFINITY}. */
  get position(): string | undefined {
    return this.value === null ? undefined : this.value.toString();
  }

  /** The earlier of the two — what two reads in one unit may both rely on. */
  lowerBound(other: ConsistencyMarker): ConsistencyMarker {
    if (this.value === null) {
      return other;
    }
    if (other.value === null) {
      return this;
    }
    return this.value <= other.value ? this : other;
  }

  /** The later of the two — where a unit's own appends move it. */
  upperBound(other: ConsistencyMarker): ConsistencyMarker {
    if (this.value === null || other.value === null) {
      return ConsistencyMarker.INFINITY;
    }
    return this.value >= other.value ? this : other;
  }

  toString(): string {
    return this.value === null ? 'INFINITY' : this.value.toString();
  }
}

/**
 * **What must still be true for an append to be accepted** — Axon 5's `AppendCondition`: no event
 * matching {@link criteria} was appended after {@link marker}.
 *
 * A unit of work builds it by reading: every source widens the criteria (`or`) and keeps the earliest
 * marker, so the append is refused if anything the unit decided on changed meanwhile.
 */
export class AppendCondition {
  private static readonly NONE = new AppendCondition(
    ConsistencyMarker.INFINITY,
    EventCriteria.anyEvent(),
  );

  constructor(
    readonly marker: ConsistencyMarker,
    readonly criteria: EventCriteria,
  ) {}

  /** No condition at all: the append is accepted whatever happened. */
  static none(): AppendCondition {
    return AppendCondition.NONE;
  }

  get isNone(): boolean {
    return this.marker.isInfinity;
  }

  withMarker(marker: ConsistencyMarker): AppendCondition {
    return new AppendCondition(marker, this.criteria);
  }
}

/**
 * **An append the store refused: something the decision depended on changed** — Axon 5's
 * `AppendEventsTransactionRejectedException`. It is not transient: the same decision against the
 * same history is refused again, so it is not retried as it stands.
 */
export class AppendEventsTransactionRejectedError extends Error {
  constructor(
    readonly condition: AppendCondition,
    detail?: string,
  ) {
    super(
      `the event store refused an append: an event matching its criteria was appended after position ${condition.marker}` +
        (detail ? ` (${detail})` : ''),
    );
    this.name = 'AppendEventsTransactionRejectedError';
  }
}
