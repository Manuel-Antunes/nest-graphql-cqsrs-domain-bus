import { type DynamicModule, Global, Module } from '@nestjs/common';
import { ClientsModule } from '@nestjs/microservices';
import { MESSAGING_OPTIONS } from './constants';
import { EnqueueCommandHandler } from './enqueue.handler';
import { EventRegistry } from './event-registry';
import type { MessagingOptions } from './messaging-options';
import { InboundEventDispatcher } from './transport/inbound-event.dispatcher';
import { NotificationEventsController } from './transport/notification-events.controller';
import { TransportEventBus } from './transport/transport-event-bus';

/**
 * A mensageria dos dois serviços. Ela não escolhe transporte por tipo de mensagem — **cada mensagem
 * escolhe o seu**:
 *
 * | | quem decide | como |
 * |---|---|---|
 * | **evento** | a classe do evento, com `@TransportType(...)` | zero, um ou vários transportes |
 * | **command** | quem emite o `EnqueueCommand`, nomeando o serviço | uma fila, um consumidor |
 *
 * É a ideia do [nestjs-transport-eventbus](https://github.com/sergey-telpuk/nestjs-transport-eventbus)
 * — difundir um evento por vários transportes, escolhidos por evento — reimplementada aqui porque a
 * lib parou no NestJS 7/rxjs 6 e carregaria uma segunda cópia do framework.
 *
 * Global porque os dois serviços precisam dela inteira, e o que ela exporta (os `ClientProxy`) é
 * resolvido por token, via `ModuleRef`.
 */
@Global()
@Module({})
export class MessagingModule {
  static forRoot(options: MessagingOptions): DynamicModule {
    return {
      module: MessagingModule,
      imports: [ClientsModule.register(options.clients)],
      controllers: [NotificationEventsController],
      providers: [
        { provide: MESSAGING_OPTIONS, useValue: options },
        EventRegistry,
        InboundEventDispatcher,
        TransportEventBus,
        EnqueueCommandHandler,
      ],
      exports: [MESSAGING_OPTIONS, EventRegistry, InboundEventDispatcher, ClientsModule],
    };
  }
}
