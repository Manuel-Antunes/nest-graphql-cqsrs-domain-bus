import { Controller } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import type { EventEnvelope } from '../event-registry';
import { InboundEventDispatcher } from './inbound-event.dispatcher';
import { NOTIFICATION_EVENT_PATTERN } from './transport.constants';

/**
 * O ouvido de difusão de qualquer serviço: um `@EventPattern` só, para todos os eventos que chegam
 * como **notificação**.
 *
 * Um padrão só, e não um por tipo de evento, porque quem roteia o evento para quem se importa é o
 * `RemoteEventBus` + o `ofType` de cada assinante — o transporte não precisa saber de tipos. Trocar
 * isto por um padrão por evento significaria mexer na infraestrutura a cada evento novo.
 *
 * Registrado nos dois serviços, nos `controllers` do módulo de cada um.
 */
@Controller()
export class NotificationEventsController {
  constructor(private readonly inbound: InboundEventDispatcher) {}

  @EventPattern(NOTIFICATION_EVENT_PATTERN)
  handle(@Payload() envelope: EventEnvelope): void {
    this.inbound.notify(envelope);
  }
}
