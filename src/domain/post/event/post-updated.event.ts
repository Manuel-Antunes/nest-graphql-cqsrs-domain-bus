import { AutoMap } from '@automapper/classes';
import type { DomainEvent } from '../../shared/domain-event';

/**
 * Evento de domínio: o conteúdo editável de um Post mudou — título, corpo e/ou tags. Disparado por
 * `post.update(...)` e por `post.assignTag(...)`.
 *
 * **Todo campo é o estado resultante, inclusive a versão.** Nada aqui é delta, e é isso que torna
 * `Post.onPostUpdatedEvent` idempotente: aplicar o mesmo evento duas vezes deixa a entidade no mesmo
 * lugar que aplicá-lo uma vez.
 *
 * Diferente da versão Java, o autor e o `createdAt` também viajam no evento, mesmo sem mudar: é o que
 * permite a subscription `onPostUpdated` montar a `PostView` inteira a partir do payload, sem ler o
 * banco — e portanto sem precisar de um contexto de EntityManager dentro de uma conexão WebSocket.
 *
 * Os campos são declarados em vez de parâmetros do construtor pelo mesmo motivo do
 * {@link PostCreatedEvent} — ver lá.
 */
export class PostUpdatedEvent implements DomainEvent {
  @AutoMap()
  readonly postId: string;
  @AutoMap()
  readonly title: string;
  @AutoMap()
  readonly content: string;
  @AutoMap()
  readonly authorId: string;
  /** O retrato do momento. Nenhuma view o lê hoje — ver `Post.create`. */
  readonly authorName: string;
  /**
   * Sem `@AutoMap()`: o tipo do item é uma `interface`, e não existe em runtime para o mapeador citar.
   * Quem traduz esta lista é um `forMember` no `PostProfile` — é o preço de um payload que
   * deliberadamente não depende de nenhuma classe.
   */
  readonly tags: readonly PostUpdatedEventTag[];
  @AutoMap()
  readonly version: number;
  @AutoMap()
  readonly createdAt: Date;
  @AutoMap()
  readonly occurredAt: Date;

  constructor(
    postId: string,
    title: string,
    content: string,
    authorId: string,
    authorName: string,
    tags: readonly PostUpdatedEventTag[],
    version: number,
    createdAt: Date,
    occurredAt: Date,
  ) {
    this.postId = postId;
    this.title = title;
    this.content = content;
    this.authorId = authorId;
    this.authorName = authorName;
    this.tags = tags;
    this.version = version;
    this.createdAt = createdAt;
    this.occurredAt = occurredAt;
  }
}

/**
 * Uma tag como ela atravessa o evento: id e nome, sem tipo do agregado Tag. Um tipo próprio em vez de
 * reusar o `TagRef` do domínio: mudar o value object não pode mudar o que já está no event store.
 */
export interface PostUpdatedEventTag {
  readonly tagId: string;
  readonly name: string;
}
