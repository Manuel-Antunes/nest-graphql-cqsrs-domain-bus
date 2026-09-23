import type { OnApplicationBootstrap, Type } from '@nestjs/common';
import { Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { ModulesContainer } from '@nestjs/core/injector/modules-container';
import { CommandBus } from '@nestjs/cqrs';

import 'reflect-metadata';

import { UnitOfWork } from './unit-of-work';

/**
 * The key `@EventsHandler` writes, copied rather than imported: it lives in
 * `@nestjs/cqrs/dist/decorators/constants`, which the package's `exports` map does not publish.
 */
const EVENTS_HANDLER_METADATA = '__eventsHandler__';

interface EventHandlerInstance {
  handle(event: unknown): unknown;
}

/**
 * **Puts a unit of work around every command, and registers on it everything a publish sets off.**
 *
 * Two wraps, both on the **instance**:
 *
 * - `CommandBus.execute` — so a command answers only once its events are appended and published, and
 *   so a command dispatched from inside an open unit joins it instead of floating away. That is the
 *   saga's path.
 * - every `@EventsHandler`'s `handle` — so a projection registers what it returns, and the unit
 *   waits for it too.
 *
 * ## Why instances, and why the handlers are found rather than intercepted
 * Replacing the `CommandBus` provider makes a **second** bus, and the symptom is silence:
 * `CqrsModule` registers every `@CommandHandler` on the instance it resolves and `EventBus` injects
 * that same instance, so binding the token to a subclass elsewhere leaves the handlers on one object
 * and the saga dispatching into the other — `CommandHandlerNotFoundException`, which a saga
 * swallows.
 *
 * Wrapping `EventBus.bind` would be the obvious way to reach the handlers and it is **too late**:
 * `CqrsModule`'s explorer calls it during ITS bootstrap, and a module is bootstrapped before the one
 * that imports it. So the handlers are discovered instead, the same way `@SubscriptionHandler`s are
 * — and it works after the fact because Nest's `bind` reads `handler.instance.handle` when the event
 * is published, not when it binds.
 */
@Injectable()
export class UnitOfWorkCommands implements OnApplicationBootstrap {
  private readonly logger = new Logger(UnitOfWorkCommands.name);

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly modulesContainer: ModulesContainer,
  ) {}

  onApplicationBootstrap(): void {
    this.aroundCommands(this.moduleRef.get(CommandBus, { strict: false }));
    const handlers = this.aroundHandlers();
    this.logger.log(
      `every command runs in a unit of work; ${handlers} event handler(s) register their work on it`,
    );
  }

  private aroundCommands(bus: CommandBus): void {
    if (wrapped.has(bus)) {
      return;
    }
    wrapped.add(bus);

    const execute = bus.execute.bind(bus);
    /**
     * `context` is the `AsyncContext` the caller passed — the request, in this repository's terms.
     * Handing it to the unit is what makes "one request, one unit" a rule rather than a hope: a
     * command dispatched with the request that is already open joins it, and one carrying a
     * different request gets a unit of its own.
     */
    bus.execute = ((command: never, context: never) =>
      UnitOfWork.run(
        () => execute(command, context),
        context,
      )) as typeof bus.execute;
  }

  private aroundHandlers(): number {
    let count = 0;
    for (const moduleRef of this.modulesContainer.values()) {
      for (const wrapper of moduleRef.providers.values()) {
        const classRef = (wrapper.instance?.constructor ?? wrapper.metatype) as
          | Type
          | undefined;
        const instance = wrapper.instance as EventHandlerInstance | undefined;
        if (
          !classRef ||
          !Reflect.getMetadata(EVENTS_HANDLER_METADATA, classRef)
        ) {
          continue;
        }
        if (
          !instance ||
          typeof instance.handle !== 'function' ||
          wrapped.has(instance)
        ) {
          continue;
        }
        wrapped.add(instance);
        const handle = instance.handle.bind(instance);
        instance.handle = (event: unknown) => {
          const work = new Promise<unknown>((resolve) =>
            resolve(handle(event)),
          );
          const unit = UnitOfWork.current();
          return unit?.staging ? unit.track(work) : work;
        };
        count += 1;
      }
    }
    return count;
  }
}

/** One process can boot more than one application — a suite does. Each object is wrapped once. */
const wrapped = new WeakSet<object>();
