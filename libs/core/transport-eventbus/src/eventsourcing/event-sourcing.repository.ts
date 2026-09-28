import type { InjectionToken, Provider } from '@nestjs/common';

import { ProcessingContext } from '../unit-of-work/processing-context';
import { ResourceKey } from '../unit-of-work/resource-key';
import { EventCriteria } from './event-criteria';
import { EventStore } from './event-store';
import { Tag } from './tag';

/** What an entity is named by: its id, or the string inside it. */
export type EntityIdentity = string | { readonly value: string };

/** What this repository needs an entity to be — which is what `AggregateRoot` already makes it. */
export interface EventSourced {
  loadFromHistory(history: never[]): void;
}

/** The entity's class: `new Post()` is the empty one a replay fills. */
export type EventSourcedClass<T extends EventSourced> = new () => T;

/**
 * **One event-sourced entity, as `TransportEventBusModule`'s `eventStore` declares it**: the class a
 * replay starts from — `new Post()`, which `@nestjs/cqrs`'s `AggregateRoot` then fills with
 * `loadFromHistory` — and `tagKey`, the tag its events carry its id under
 * (`@EventType({ tags: ['postId'] })`). Declared at the root, because the entity's library knows
 * nothing of this one.
 */
export interface EventSourcedEntityDefinition<
  T extends EventSourced = EventSourced,
> {
  readonly entity: EventSourcedClass<T>;
  readonly tagKey: string;
  /** The token the repository is injected by; `EventSourcingRepository` itself by default. */
  readonly token?: InjectionToken;
}

/**
 * **An entity, loaded from its events** — Axon 5's `EventSourcingRepository`, once, for any entity.
 *
 * ```ts
 * TransportEventBusModule.forRoot({
 *   …,
 *   eventStore: { engine: MikroOrmEventStorageEngine, entities: [{ entity: Post, tagKey: 'postId' }] },
 * })
 * ```
 *
 * ```ts
 * constructor(private readonly posts: EventSourcingRepository<Post>) {}
 *
 * const post = await this.posts.load(command.postId);   // sourced in this unit of work
 * this.publisher.mergeObjectContext(post, this.request).complete([tag], new Date());
 * post.commit();                                         // appended at PREPARE_COMMIT — if nothing changed meanwhile
 * ```
 *
 * ## What loading does to the unit of work
 * It is a read with a criteria — every event tagged with the entity's id — and the event store
 * records it on the unit: the events the unit publishes are appended on condition that no event
 * matching that criteria was appended since. Two units that decide about the same post at once cannot
 * both succeed; the second is refused with `AppendEventsTransactionRejectedError`. That is Axon 5's
 * dynamic consistency boundary, with the boundary drawn by the entity's tag.
 *
 * Within one unit an entity is loaded once: a second `load` of the same id answers the same instance,
 * with whatever it has applied since.
 *
 * ## Why there is no `save`
 * Because committing the entity already is one: `commit()` publishes, and the bus appends what is
 * published in `PREPARE_COMMIT`. A `save` beside it would be a second path to the same rows.
 */
export class EventSourcingRepository<T extends EventSourced> {
  private readonly loaded = new ResourceKey<Map<string, T>>(
    'EventSourcingRepository.loaded',
  );

  /** The provider for one entity. */
  static of<T extends EventSourced>(
    definition: EventSourcedEntityDefinition<T>,
  ): Provider {
    return {
      provide: definition.token ?? EventSourcingRepository,
      inject: [EventStore],
      useFactory: (store: EventStore) =>
        new EventSourcingRepository(
          definition.entity,
          definition.tagKey,
          store,
        ),
    };
  }

  constructor(
    private readonly entity: EventSourcedClass<T>,
    private readonly tagKey: string,
    private readonly store: EventStore,
  ) {}

  /** The entity as its events describe it, or `null` when this service has never heard of it. */
  async load(id: EntityIdentity): Promise<T | null> {
    const key = typeof id === 'string' ? id : id.value;
    const context = ProcessingContext.current();
    const cached = context
      ?.computeResourceIfAbsent(this.loaded, () => new Map<string, T>())
      .get(key);
    if (cached) {
      return cached;
    }

    const history = await this.store.source(
      EventCriteria.havingTags(new Tag(this.tagKey, key)),
      context,
    );
    if (history.length === 0) {
      return null;
    }
    const instance = new this.entity();
    instance.loadFromHistory(
      history.map((message) => message.payload) as never[],
    );
    context?.getResource(this.loaded)?.set(key, instance);
    return instance;
  }
}
