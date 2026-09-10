import { Injectable } from '@nestjs/common';
import type { PostCreatedEvent } from '../../domain/post/event/post-created.event';
import type { PostUpdatedEvent } from '../../domain/post/event/post-updated.event';
import type { Post } from '../../domain/post/post.entity';
import { PostView } from '../../dto/graphql/post.view';
import { TagView } from '../../dto/graphql/tag.view';

/**
 * Domínio → `PostView` (domínio → protocolo). Três origens, um destino:
 *
 * - `fromPost`: a entidade, para queries e mutations — exige `post.tags` populado (ver
 *   `PostRepository`). O autor já **não** precisa estar carregado para esta chamada: o que sai daqui é
 *   `post.author.id`, que a referência sabe sem ir ao banco. Ele continua sendo populado no
 *   repositório, e é esse populate que faz o `PostAuthorResolver` resolver de graça — ver lá;
 * - `fromCreatedEvent` / `fromUpdatedEvent`: o payload do evento, para as subscriptions — a view
 *   sai do que passou pelo `EventBus`, sem consultar o banco. `onPostCreated` publica sempre o post
 *   como ele nasceu (v1, sem tags); a tag padrão chega em seguida por `onPostUpdated`.
 *
 * O `Object.assign(new PostView(), …)` de antes virou `new PostView(…)`: o construtor do DTO é que
 * monta os value objects a partir dos valores crus do evento ou da linha. Nenhum `parse` avulso aqui
 * — o value object embutido faz a travessia, e o domínio continua sendo quem valida.
 *
 * ## O autor virou um id, nos três caminhos
 * Os três passavam o **nome** do autor (`post.author.getEntity().name` num, `event.authorName` nos
 * outros), porque o protocolo expunha `author: String!`. Agora expõe `author: Author!`, e o que a view
 * carrega é a identidade: `authorId`. O `authorName` continua no payload dos eventos — é o retrato do
 * momento, e um fato gravado não se reescreve —, só deixou de ser o que a borda lê.
 */
@Injectable()
export class PostViewMapper {
  fromPost(post: Post): PostView {
    return new PostView({
      id: post.id,
      title: post.title,
      content: post.content,
      authorId: post.author.id,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      version: post.version,
      tags: post.tags.getItems().map((tag) => new TagView({ id: tag.id, name: tag.name })),
    });
  }

  fromCreatedEvent(event: PostCreatedEvent): PostView {
    return new PostView({
      id: event.postId,
      title: event.title,
      content: event.content,
      authorId: event.authorId,
      createdAt: event.occurredAt,
      updatedAt: event.occurredAt,
      version: 1,
      tags: [],
    });
  }

  fromUpdatedEvent(event: PostUpdatedEvent): PostView {
    return new PostView({
      id: event.postId,
      title: event.title,
      content: event.content,
      authorId: event.authorId,
      createdAt: event.createdAt,
      updatedAt: event.occurredAt,
      version: event.version,
      tags: event.tags.map(({ tagId, name }) => new TagView({ id: tagId, name })),
    });
  }
}
