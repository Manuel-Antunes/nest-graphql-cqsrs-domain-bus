import type { DomainEvent } from '../../shared/domain-event';

/**
 * Evento de domínio: um Post passou a existir. Disparado por `Post.create(...)`.
 *
 * Carrega o estado inicial completo, então a subscription `onPostCreated` monta a view sem consultar
 * nada — direto do payload que passou pelo `EventBus`.
 */
export class PostCreatedEvent implements DomainEvent {
  constructor(
    readonly postId: string,
    readonly title: string,
    readonly content: string,
    readonly author: string,
    readonly occurredAt: Date,
  ) {}
}
