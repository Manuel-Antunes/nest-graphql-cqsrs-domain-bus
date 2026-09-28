import 'reflect-metadata';

const PROCESSING_GROUP = Symbol.for(
  'nestposts.transport-eventbus.processing-group',
);

/**
 * What a group is processed by when the application's root says nothing about it — a default the
 * handler's author knows, such as test support that must run after the commit. The root's
 * `processingGroups` always wins.
 */
export interface ProcessingGroupDefaults {
  readonly processor?: 'subscribing' | 'streaming';
  /**
   * The events a class of **sagas** reacts to — Axon's supported events, which an `@EventsHandler`
   * already declares and a `@Saga`, whose `ofType` is inside a stream, cannot. A streaming group is
   * staged a message for each event its handlers take; without this, a saga takes every event.
   */
  readonly events?: readonly (abstract new (
    ...args: never[]
  ) => object)[];
}

/**
 * **The processing group an event handler or a saga belongs to** — Axon's processing group: the
 * handlers that are processed together, by one processor, with one error handler.
 *
 * ```ts
 * @Injectable()
 * @ProcessingGroup('notifications')
 * export class NotifyAuthorOnPostCreated {
 *   @Saga()
 *   notify = (events$: Observable<IEvent>) => …;
 * }
 * ```
 *
 * What a group is processed by is the application's decision, at its root
 * (`TransportEventBusModule`'s `processingGroups`), and the decorator's default otherwise:
 * **subscribing**, unless something says otherwise — the handlers are
 * told in the `PREPARE_COMMIT` of the unit that published, inside its transaction, and a failure
 * fails that unit — or **streaming**, through the outbox's `local` transport — each event is a
 * message of the group's own, delivered after the commit in a unit of its own, retried and
 * dead-lettered by `@nestjs/outbox`.
 *
 * A class without one is a group of its own, named after the class.
 */
export function ProcessingGroup(
  name: string,
  defaults: ProcessingGroupDefaults = {},
): ClassDecorator {
  return (target) => {
    Reflect.defineMetadata(PROCESSING_GROUP, { name, ...defaults }, target);
  };
}

/** The processing group of a handler class: its {@link ProcessingGroup}, or its name. */
ProcessingGroup.of = (handler: { readonly name: string }): string =>
  declaredOn(handler)?.name ?? handler.name;

/** The events the class's {@link ProcessingGroup} declared its sagas react to, if it declared any. */
ProcessingGroup.eventsOf = (handler: {
  readonly name: string;
}): readonly (abstract new (...args: never[]) => object)[] | undefined =>
  declaredOn(handler)?.events;

/** What the class's {@link ProcessingGroup} declared its group is processed by, if anything. */
ProcessingGroup.processorOf = (handler: {
  readonly name: string;
}): 'subscribing' | 'streaming' | undefined => declaredOn(handler)?.processor;

const declaredOn = (
  handler: object,
): (ProcessingGroupDefaults & { readonly name: string }) | undefined =>
  Reflect.getMetadata(PROCESSING_GROUP, handler) as
    | (ProcessingGroupDefaults & { readonly name: string })
    | undefined;
