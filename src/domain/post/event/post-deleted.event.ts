import type { DomainEvent } from '../../shared/domain-event';

/**
 * Evento de domínio: um Post foi apagado — de forma **reversível**. Disparado por `post.softDelete(...)`.
 *
 * A linha continua no banco; o que muda é o `deletedAt`. Quem some é o post das consultas, pelo filtro
 * de ativos. `PostRestoredEvent` desfaz.
 */
export class PostDeletedEvent implements DomainEvent {
  constructor(
    readonly postId: string,
    readonly version: number,
    readonly occurredAt: Date,
  ) {}
}
