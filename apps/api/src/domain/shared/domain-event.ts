import type { IEvent } from '@nestjs/cqrs';

/**
 * Marcador dos fatos do domínio. Estende o `IEvent` do @nestjs/cqrs porque é ele que o `EventBus`
 * transporta — e o `EventBus` é o único "event store" desta POC (em memória, um `Subject` do RxJS).
 *
 * O payload de um evento é feito de primitivos (string, number, Date): evento é contrato — atravessa
 * processo, é serializado e fica gravado para sempre. Quem transforma texto em value object é a
 * entidade, na fronteira.
 */
export interface DomainEvent extends IEvent {
  readonly occurredAt: Date;
}
