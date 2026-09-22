import type { InjectionToken, Provider } from '@nestjs/common';
import { EventLog } from './event-log';

/** What a stream is named by: an aggregate's id, or the string inside it. */
export type StreamIdentity = string | { readonly value: string };

/** What this repository needs an aggregate to be — which is what `AggregateRoot` already makes it. */
export interface EventSourced {
  readonly id: { readonly value: string };
  loadFromHistory(history: never[]): void;
  getUncommittedEvents(): readonly object[];
}

/** The aggregate's class: `new Post()` is the empty one a replay fills. */
export type EventSourcedClass<T extends EventSourced> = new () => T;

/**
 * **An aggregate, loaded from its stream and saved as the events it raised.** The event-sourced
 * repository, once, for any aggregate.
 *
 * ```ts
 * providers: [...eventStoreProviders, EventSourcedRepository.of(Post)]
 * ```
 *
 * ```ts
 * constructor(private readonly posts: EventSourcedRepository<Post>) {}
 *
 * const post = await this.posts.load(command.postId);          // replayed from the stream
 * this.publisher.mergeObjectContext(post, this.request).complete([tag], new Date());
 * await this.posts.save(post);                                  // its decision, appended
 * post.commit();                                                // and published
 * ```
 *
 * ## Why a replay and not a row
 * Because the service that owns the table is the other one. This one has the events — the ones it
 * ingested and the ones it decided — and an aggregate built from them answers about its own state:
 * `isComplete()`, the version, the tags. That is what lets a decision be refused by the aggregate
 * itself, which is the guard that survives an emptied inbox.
 *
 * ## Why it is generic, and what that costs
 * Nothing about "load the stream, replay it, append what was raised" is about a Post: the aggregate
 * declares its own `on<Event>` handlers, and they are the same ones its own service replays with. The
 * type parameter is the whole configuration, which is why a service that event-sources writes
 * **no** repository of its own.
 */
export class EventSourcedRepository<T extends EventSourced> {
  /**
   * The provider for one aggregate. The token defaults to this class, which is what a handler injects
   * (`EventSourcedRepository<Post>`); a service that event-sources more than one aggregate gives each
   * its own token.
   */
  static of<T extends EventSourced>(
    aggregate: EventSourcedClass<T>,
    token: InjectionToken = EventSourcedRepository,
  ): Provider {
    return {
      provide: token,
      inject: [EventLog],
      useFactory: (log: EventLog) => new EventSourcedRepository(aggregate, log),
    };
  }

  constructor(
    private readonly aggregate: EventSourcedClass<T>,
    private readonly log: EventLog,
  ) {}

  /** The aggregate as its stream describes it, or `null` when this service has never heard of it. */
  async load(id: StreamIdentity): Promise<T | null> {
    const history = await this.log.readStream(streamIdOf(id));
    if (history.length === 0) {
      return null;
    }
    const aggregate = new this.aggregate();
    aggregate.loadFromHistory(history as never[]);
    return aggregate;
  }

  /**
   * Appends what the aggregate has raised and not yet committed — the same events `commit()` is about
   * to publish, which is what keeps the stream and the wire saying the same thing.
   */
  save(aggregate: T): Promise<void> {
    return this.log.append(aggregate.getUncommittedEvents(), aggregate.id.value);
  }
}

const streamIdOf = (id: StreamIdentity): string => (typeof id === 'string' ? id : id.value);
