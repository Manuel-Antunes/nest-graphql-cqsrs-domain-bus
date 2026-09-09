import type { DomainEvent } from '../../shared/domain-event';

/**
 * Evento de domínio: o conteúdo editável de um Post mudou — título, corpo e/ou tags. Disparado por
 * `post.update(...)` e por `post.assignTag(...)`.
 *
 * **Todo campo é o estado resultante, inclusive a versão.** Nada aqui é delta, e é isso que torna
 * `Post.onPostUpdatedEvent` idempotente: aplicar o mesmo evento duas vezes deixa a entidade no mesmo
 * lugar que aplicá-lo uma vez.
 *
 * Diferente da versão Java, `author` e `createdAt` também viajam no evento, mesmo sem mudar: é o que
 * permite a subscription `onPostUpdated` montar a `PostView` inteira a partir do payload, sem ler o
 * banco — e portanto sem precisar de um contexto de EntityManager dentro de uma conexão WebSocket.
 */
export class PostUpdatedEvent implements DomainEvent {
  constructor(
    readonly postId: string,
    readonly title: string,
    readonly content: string,
    readonly author: string,
    readonly tags: readonly PostUpdatedEventTag[],
    readonly version: number,
    readonly createdAt: Date,
    readonly occurredAt: Date,
  ) {}
}

/**
 * Uma tag como ela atravessa o evento: id e nome, sem tipo do agregado Tag. Um tipo próprio em vez de
 * reusar o `TagRef` do domínio: mudar o value object não pode mudar o que já está no event store.
 */
export interface PostUpdatedEventTag {
  readonly tagId: string;
  readonly name: string;
}
