import { Module } from '@nestjs/common';
import { CqsrsModule } from '@app/cqsrs';
import {
  API_QUEUE,
  API_SERVICE,
  ORDER_EVENTS,
  orderPaymentsProviders,
  PAYMENTS_QUEUE,
  PAYMENTS_SERVICE,
} from '@app/order';
import {
  DURABLE_EVENT_PATTERN,
  EVENTS_DURABLE_CLIENT,
  EVENTS_NOTIFY_CLIENT,
  MessagingModule,
  NOTIFICATION_EVENT_PATTERN,
  rabbitUrl,
  redisHost,
  redisPort,
} from '@app/messaging';
import { Transport } from '@nestjs/microservices';
import { PaymentsController } from './payments.controller';

/** Como este serviço se apresenta no canal de eventos — a origem que descarta o próprio eco. */
export const PAYMENTS_SERVICE_NAME = 'payments';

/**
 * O serviço de pagamentos: sem HTTP, sem GraphQL, sem banco. Ele escuta uma fila, decide, e conta o
 * que decidiu.
 *
 * Registra os dois clientes de command (pagamentos e API) porque as duas pontas da coreografia saem
 * daqui: a captura vai para a própria fila, o "está pago" vai para a da API. E registra os dois
 * caminhos de evento, porque é ele quem dispara o `PaymentCapturedEvent` — o único que sai por
 * difusão **e** por fila.
 */
@Module({
  imports: [
    CqsrsModule.forRoot(),
    MessagingModule.forRoot({
      service: PAYMENTS_SERVICE_NAME,
      events: [...ORDER_EVENTS],
      clients: [
        // filas de command: uma por serviço, um consumidor cada
        { name: PAYMENTS_SERVICE, transport: Transport.RMQ, options: { urls: [rabbitUrl()], queue: PAYMENTS_QUEUE, queueOptions: { durable: false } } },
        { name: API_SERVICE, transport: Transport.RMQ, options: { urls: [rabbitUrl()], queue: API_QUEUE, queueOptions: { durable: false } } },
        // os dois caminhos de evento: difusão e fila
        { name: EVENTS_NOTIFY_CLIENT, transport: Transport.REDIS, options: { host: redisHost(), port: redisPort() } },
        { name: EVENTS_DURABLE_CLIENT, transport: Transport.RMQ, options: { urls: [rabbitUrl()], queue: API_QUEUE, queueOptions: { durable: false } } },
      ],
      eventTransports: [
        { transport: Transport.REDIS, client: EVENTS_NOTIFY_CLIENT, pattern: NOTIFICATION_EVENT_PATTERN },
        { transport: Transport.RMQ, client: EVENTS_DURABLE_CLIENT, pattern: DURABLE_EVENT_PATTERN },
      ],
    }),
  ],
  controllers: [PaymentsController],
  providers: [...orderPaymentsProviders],
})
export class PaymentsModule {}
