import { type EventEnvelope, DURABLE_EVENT_PATTERN, InboundEventDispatcher } from '@app/messaging';
import { PaymentCapturedEvent } from '@app/order';
import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { PaymentLedger } from '../../ledger/payment-ledger';

/**
 * O consumidor **durável**: escuta a fila, não a difusão.
 *
 * Repare no contraste com o `NotificationEventsController`, que também recebe eventos de outro
 * serviço: aquele entrega tudo no `RemoteEventBus`, para quem quiser ver; este pega um tipo
 * específico e faz um trabalho que não pode ser perdido. Mesma origem, dois transportes, duas
 * garantias — e é o `@TransportType` do evento que decide que ele vai pelos dois.
 *
 * Chega pela fila `order.api`, a mesma dos commands: um evento durável e um command são a mesma
 * necessidade de entrega (uma vez, com ack), então dividem a fila e se distinguem pelo padrão.
 */
@Controller()
export class LedgerController {
  constructor(
    private readonly inbound: InboundEventDispatcher,
    private readonly ledger: PaymentLedger,
  ) {}

  @EventPattern(DURABLE_EVENT_PATTERN)
  handle(@Payload() envelope: EventEnvelope): void {
    const event = this.inbound.receive(envelope);
    if (event instanceof PaymentCapturedEvent) {
      this.ledger.record(event);
    }
  }
}
