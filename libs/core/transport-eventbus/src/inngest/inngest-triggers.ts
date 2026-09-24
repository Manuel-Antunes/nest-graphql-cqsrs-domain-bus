import type { InngestTriggerResolver } from '@nestposts/microservices-inngest/inngest-triggers';
import { literalTriggers } from '@nestposts/microservices-inngest/inngest-triggers';
import { registeredEventTypes } from '@nestposts/platform/domain/shared/event-type';

const EVERY_SEGMENT = '.#';

/**
 * **A binding, as the event names Inngest can actually trigger on** — the resolver `InngestStrategy`
 * takes as `triggers`, for a service whose events are declared with `@EventType`.
 *
 * Inngest matches a trigger by exact name, so every wildcard this repository's bindings are written
 * with has to be resolved into the names it stands for — at boot, from the `@EventType` registry
 * that already knows every event in the process:
 *
 * | the `@EventPattern` | the triggers |
 * |---|---|
 * | `posts.#` | one per registered event of the `posts` namespace |
 * | `posts.PostCreated.*` | `posts.PostCreated` |
 * | `posts.PostCreated` | itself |
 *
 * The cost of the first row is the one a registry always has: an event type whose module was never
 * imported is not registered, so it is not triggered. That is the same rule the message type already
 * follows when the ingestion rebuilds a class, so a service that can *handle* an event can bind to it.
 *
 * The other cost is a ceiling: a function takes at most ten of them, so a namespace that grows past
 * ten events outgrows a single `.#` binding. That fails at boot rather than at delivery, because the
 * alternative is a service that starts, serves traffic and is never triggered for the events that did
 * not fit.
 */
export const inngestTriggers: InngestTriggerResolver = (pattern) => {
  if (pattern.endsWith(EVERY_SEGMENT)) {
    const namespace = pattern.slice(0, -EVERY_SEGMENT.length);
    return registeredEventTypes()
      .filter((type) => type.namespace === namespace)
      .map((type) => type.qualifiedName)
      .sort();
  }
  return literalTriggers(pattern);
};
