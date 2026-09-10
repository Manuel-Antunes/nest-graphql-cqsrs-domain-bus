import type { DomainEvent } from '../../shared/domain-event';

/**
 * Evento de domínio: um User foi apagado — de forma **reversível**. Disparado por `user.softDelete(...)`.
 *
 * A linha permanece; o que muda é o `deletedAt`. O efeito colateral que importa é indireto: os posts
 * dele referenciam o User, e o filtro de ativos vale para os dois lados — some o autor, somem os posts
 * das consultas, sem que nenhuma linha de post seja tocada. `UserRestoredEvent` desfaz.
 */
export class UserDeletedEvent implements DomainEvent {
  constructor(
    readonly userId: string,
    readonly occurredAt: Date,
  ) {}
}
