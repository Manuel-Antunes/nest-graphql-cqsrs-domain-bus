import type { OnModuleInit, Type } from '@nestjs/common';
import { Injectable, Logger } from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core/injector/modules-container';
import type { ICommand, IEvent } from '@nestjs/cqrs';
import type { Observable } from 'rxjs';
import { filter, tap } from 'rxjs';

import 'reflect-metadata';

import { DeliveryScope } from './delivery-scope';
import { ProcessingGroup } from './processing-group';
import { ProcessingGroups } from './processing-groups';

/**
 * The keys `@EventsHandler` and `@Saga` write, copied rather than imported: they live in
 * `@nestjs/cqrs/dist/decorators/constants`, which the package's `exports` map does not publish.
 */
const EVENTS_HANDLER_METADATA = '__eventsHandler__';
const SAGA_METADATA = '__saga__';

interface HandlerPrototype {
  handle(event: unknown): unknown;
}

type SagaFunction = (events$: Observable<IEvent>) => Observable<ICommand>;

interface GroupInterest {
  readonly events: Set<Type<object>>;
  everything: boolean;
}

const wrapped = new WeakSet<object>();

/**
 * **The event handlers of this application, as Axon 5's event handling components** — which group
 * each belongs to, which events each takes, and the wrapping that makes `@nestjs/cqrs`'s handlers
 * part of a {@link DeliveryScope}.
 *
 * ## What is wrapped, and when
 * Every `@EventsHandler`'s `handle`, on its **prototype** — so a request-scoped handler, which
 * `@nestjs/cqrs` resolves afresh for every event, is covered as well — and every `@Saga` of every
 * provider, on the instance. It happens in `onModuleInit`, which every module runs before any runs
 * `onApplicationBootstrap`: that is where `CqrsModule` binds the handlers and hands each saga its
 * observable, and a saga registered unwrapped could not be reached afterwards.
 *
 * A wrapped handler invoked in a delivery that does not admit its group does nothing; one that is
 * admitted tracks its promise on the delivery. A wrapped saga sees only the events of deliveries that
 * admit its group, and marks the commands it emits with its group, so a command's failure is the
 * group's failure. Outside any delivery — something publishing straight onto `EventBus` — every
 * handler runs, as it always did.
 */
@Injectable()
export class EventHandlingComponents implements OnModuleInit {
  private readonly logger = new Logger(EventHandlingComponents.name);

  private readonly interests = new Map<string, GroupInterest>();

  constructor(
    private readonly modulesContainer: ModulesContainer,
    private readonly groups: ProcessingGroups,
  ) {}

  onModuleInit(): void {
    let handlers = 0;
    let sagas = 0;
    for (const moduleRef of this.modulesContainer.values()) {
      for (const wrapper of moduleRef.providers.values()) {
        const classRef = (wrapper.instance?.constructor ?? wrapper.metatype) as
          | Type<object>
          | undefined;
        if (!classRef || typeof classRef !== 'function') {
          continue;
        }
        const events = Reflect.getMetadata(EVENTS_HANDLER_METADATA, classRef) as
          | Type<object>[]
          | undefined;
        if (events) {
          this.aroundHandler(classRef, wrapper.instance, events);
          handlers += 1;
        }
        const keys = Reflect.getMetadata(SAGA_METADATA, classRef) as
          | string[]
          | undefined;
        if (keys?.length && wrapper.instance) {
          this.aroundSagas(classRef, wrapper.instance as object, keys);
          sagas += keys.length;
        }
      }
    }
    this.logger.log(
      `${handlers} event handler(s) and ${sagas} saga(s) in ${this.interests.size} processing group(s)`,
    );
    for (const [group, interest] of this.interests) {
      if (interest.everything && this.groups.isStreaming(group)) {
        this.logger.warn(
          `streaming processing group '${group}' has a saga that declares no events: every event is ` +
            `staged a message for it. Declare them — @ProcessingGroup('${group}', { events: [...] })`,
        );
      }
    }
  }

  /** The groups whose handlers take this event: those that declared its class, and every group with a saga. */
  groupsFor(event: object): string[] {
    return [...this.interests.entries()]
      .filter(
        ([, interest]) =>
          interest.everything ||
          interest.events.has(event.constructor as Type<object>),
      )
      .map(([group]) => group);
  }

  private interestOf(group: string, classRef: Type<object>): GroupInterest {
    const processor = ProcessingGroup.processorOf(classRef);
    if (processor) {
      this.groups.declare(group, processor);
    }
    let interest = this.interests.get(group);
    if (!interest) {
      interest = { events: new Set(), everything: false };
      this.interests.set(group, interest);
    }
    return interest;
  }

  private aroundHandler(
    classRef: Type<object>,
    instance: unknown,
    events: Type<object>[],
  ): void {
    const group = ProcessingGroup.of(classRef);
    const interest = this.interestOf(group, classRef);
    for (const event of events) {
      interest.events.add(event);
    }

    const prototype = classRef.prototype as HandlerPrototype;
    const target =
      instance &&
      Object.hasOwn(instance as object, 'handle') &&
      typeof (instance as HandlerPrototype).handle === 'function'
        ? (instance as HandlerPrototype)
        : prototype;
    if (typeof target.handle !== 'function' || wrapped.has(target)) {
      return;
    }
    wrapped.add(target);
    const original = target.handle;
    target.handle = function handle(this: unknown, event: unknown) {
      const scope = DeliveryScope.current();
      if (scope && !scope.admits(group)) {
        return Promise.resolve();
      }
      const work = new Promise<unknown>((resolve) =>
        resolve(original.call(this, event)),
      );
      return scope ? scope.track(work, group) : work;
    };
  }

  private aroundSagas(
    classRef: Type<object>,
    instance: object,
    keys: string[],
  ): void {
    const group = ProcessingGroup.of(classRef);
    const interest = this.interestOf(group, classRef);
    const declared = ProcessingGroup.eventsOf(classRef);
    if (declared) {
      for (const event of declared) {
        interest.events.add(event as Type<object>);
      }
    } else {
      interest.everything = true;
    }
    const sagas = instance as Record<string, SagaFunction>;
    for (const key of keys) {
      const original = sagas[key];
      if (typeof original !== 'function' || wrapped.has(original)) {
        continue;
      }
      const saga: SagaFunction = (events$) =>
        original
          .call(
            instance,
            events$.pipe(
              filter(() => DeliveryScope.current()?.admits(group) ?? true),
            ),
          )
          .pipe(
            tap((command) => {
              if (command) {
                DeliveryScope.markCommand(command, group);
              }
            }),
          );
      wrapped.add(saga);
      sagas[key] = saga;
    }
  }
}
