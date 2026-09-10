import type { DomainEvent } from '../../shared/domain-event';

/**
 * Evento de domínio: um Post passou a existir. Disparado por `Post.create(...)`.
 *
 * Carrega o estado inicial completo, então a subscription `onPostCreated` monta a view sem consultar
 * nada — direto do payload que passou pelo `EventBus`.
 *
 * O autor viaja como **id + nome**: o id é a identidade (o que liga o fato ao agregado `User`), o nome
 * é o retrato do momento (o que a view precisa exibir sem carregar o autor). É a mesma divisão das
 * tags — ver `PostUpdatedEventTag`.
 */
export class PostCreatedEvent implements DomainEvent {
  constructor(
    readonly postId: string,
    readonly title: string,
    readonly content: string,
    readonly authorId: string,
    readonly authorName: string,
    readonly occurredAt: Date,
  ) {}
}
