import type { OnApplicationBootstrap } from '@nestjs/common';
import { Injectable, Logger } from '@nestjs/common';
import { AsyncContext, CommandBus } from '@nestjs/cqrs';

import { DeliveryScope } from '../eventhandling/delivery-scope';
import { CommandMessage } from '../messaging/command-message';
import { MessageInterceptors } from '../messaging/message-interceptors';
import { RequestContextCodec } from '../request-context';
import { ProcessingContext } from './processing-context';
import { UnitOfWorkFactory } from './unit-of-work-factory';

const wrapped = new WeakSet<object>();

/**
 * **Every command in a unit of work of its own** — what Axon 5's `SimpleCommandBus` does:
 * `unitOfWorkFactory.create(command.identifier())` and `executeWithResult` around the handler, for
 * every command, whoever dispatched it.
 *
 * ```
 * commandBus.execute(command, request)
 *   the command becomes a CommandMessage: what the request stands for, and — through the dispatch
 *   interceptors — the correlation data of the message being handled where it was dispatched
 *   a new unit of work, given that message, runs the handler behind the handler interceptors
 *   PREPARE_COMMIT  what the handler published is appended, written to the outbox, told
 *   COMMIT          the transaction commits — or, dispatched inside another unit's transaction, joins it
 *   AFTER_COMMIT    the relay is woken
 * execute resolves with the handler's answer, once all of that succeeded
 * ```
 *
 * ## A command a saga sends is not part of the saga's unit
 * It is a unit of its own, as in Axon 5: what crosses is correlation data — the command is caused by
 * the event the saga reacted to — not the unit. What the delivery that set the saga off does is
 * **wait** for it ({@link DeliveryScope}): `@nestjs/cqrs` dispatches a saga's commands into the void,
 * and in a function the handler returning is the container freezing.
 *
 * ## Why the instance, and not a provider
 * Replacing the `CommandBus` provider makes a **second** bus: `CqrsModule` registers every
 * `@CommandHandler` on the instance it resolves, so a substitute elsewhere leaves the handlers on one
 * object and the saga dispatching into the other — `CommandHandlerNotFoundException`, which a saga
 * swallows. The instance is decorated instead.
 */
@Injectable()
export class UnitOfWorkCommands implements OnApplicationBootstrap {
  private readonly logger = new Logger(UnitOfWorkCommands.name);

  constructor(
    private readonly commandBus: CommandBus,
    private readonly units: UnitOfWorkFactory,
    private readonly interceptors: MessageInterceptors,
    private readonly codec: RequestContextCodec,
  ) {}

  onApplicationBootstrap(): void {
    if (wrapped.has(this.commandBus)) {
      return;
    }
    wrapped.add(this.commandBus);
    const execute = this.commandBus.execute.bind(this.commandBus);
    this.commandBus.execute = ((command: object, request?: AsyncContext) =>
      this.inUnitOfWork(
        command,
        request,
        execute,
      )) as typeof this.commandBus.execute;
    this.logger.log('every command runs in a unit of work of its own');
  }

  private inUnitOfWork(
    command: object,
    request: AsyncContext | undefined,
    execute: (command: never, request?: AsyncContext) => Promise<unknown>,
  ): Promise<unknown> {
    const dispatching = ProcessingContext.current();
    const message = this.interceptors.dispatch(
      CommandMessage.of(
        command,
        this.codec.toMetadata(request ?? AsyncContext.of(command)),
      ),
      dispatching,
    );
    const result = ProcessingContext.runOutside(() =>
      this.units
        .create({ identifier: message.identifier, message })
        .executeWithResult((context) =>
          this.interceptors.handle(message, context, (_handled, handling) =>
            ProcessingContext.runIn(handling, () =>
              execute(command as never, request),
            ),
          ),
        ),
    );

    const group = DeliveryScope.groupOfCommand(command);
    const scope = DeliveryScope.current(dispatching);
    if (scope && group) {
      scope.track(result, group);
    }
    return result;
  }
}
