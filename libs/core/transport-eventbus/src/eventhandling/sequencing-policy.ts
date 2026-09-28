import { Logger } from '@nestjs/common';

import type { Tag } from '../eventsourcing/tag';
import type { EventMessage } from '../messaging/event-message';

/**
 * **Which events must be handled one after the other** — Axon 5's `SequencingPolicy`. Events with the
 * same sequence identifier are published, delivered and handled in order; events with different ones
 * may overtake each other.
 *
 * Here it is `@nestjs/outbox`'s `key`: every message a policy puts in one sequence is published one at
 * a time, in commit order — which is the only ordering the outbox promises, and the one a broker's
 * FIFO group and a routing key's last segment are built from.
 */
export abstract class SequencingPolicy {
  /** The sequence, or `undefined` when this policy has no opinion — see {@link HierarchicalSequencingPolicy}. */
  abstract sequenceIdentifierFor(
    message: EventMessage,
    tags: readonly Tag[],
  ): string | undefined;
}

/**
 * **One sequence per entity** — the events of one post in order, two posts side by side. Axon's
 * `SequentialPerAggregatePolicy`, read off the event's tag instead of an aggregate identifier, which
 * Axon 5 no longer puts on the message.
 *
 * An event with more than one tag is about more than one entity, and can only be ordered by one of
 * them: the first, in order, which is stable but not informed — hence the warning.
 */
export class SequentialPerEntityPolicy extends SequencingPolicy {
  private static readonly logger = new Logger(SequentialPerEntityPolicy.name);

  sequenceIdentifierFor(
    message: EventMessage,
    tags: readonly Tag[],
  ): string | undefined {
    if (tags.length > 1) {
      SequentialPerEntityPolicy.logger.warn(
        `${message.type} has ${tags.length} tags (${tags.map((tag) => tag.key).join(', ')}) — it is ` +
          `sequenced by '${tags[0].key}', the first in order. Declare a SequencingPolicy if another is meant.`,
      );
    }
    return tags[0]?.value;
  }
}

/** **Everything in one sequence** — Axon's `SequentialPolicy`. */
export class SequentialPolicy extends SequencingPolicy {
  static readonly SEQUENCE = 'none';

  sequenceIdentifierFor(): string {
    return SequentialPolicy.SEQUENCE;
  }
}

/** **The first policy that has an answer** — Axon's `HierarchicalSequencingPolicy`. */
export class HierarchicalSequencingPolicy extends SequencingPolicy {
  constructor(
    private readonly primary: SequencingPolicy,
    private readonly fallback: SequencingPolicy,
  ) {
    super();
  }

  sequenceIdentifierFor(
    message: EventMessage,
    tags: readonly Tag[],
  ): string | undefined {
    return (
      this.primary.sequenceIdentifierFor(message, tags) ??
      this.fallback.sequenceIdentifierFor(message, tags)
    );
  }
}

/**
 * **Axon 5's default**: per entity, and everything untagged in one sequence — the same answer
 * `SimpleEventHandlingComponent` gives when nothing else is declared.
 */
export class DefaultSequencingPolicy extends HierarchicalSequencingPolicy {
  constructor() {
    super(new SequentialPerEntityPolicy(), new SequentialPolicy());
  }
}
