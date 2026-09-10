import type { DomainEvent } from '../../shared/domain-event';

/** Evento de domínio: um Post apagado voltou. Disparado por `post.restore(...)`; limpa o `deletedAt`. */
export class PostRestoredEvent implements DomainEvent {
  constructor(
    readonly postId: string,
    readonly version: number,
    readonly occurredAt: Date,
  ) {}
}
