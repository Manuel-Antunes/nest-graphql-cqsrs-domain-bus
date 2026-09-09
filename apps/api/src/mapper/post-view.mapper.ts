import { Injectable } from '@nestjs/common';
import type { PostCreatedEvent } from '../domain/post/event/post-created.event';
import type { PostUpdatedEvent } from '../domain/post/event/post-updated.event';
import type { Post } from '../domain/post/post.entity';
import { PostView } from '../dto/graphql/post.view';

/**
 * Domínio → `PostView` (domínio → protocolo). Três origens, um destino:
 *
 * - `fromPost`: a entidade, para queries e mutations;
 * - `fromCreatedEvent` / `fromUpdatedEvent`: o payload do evento, para as subscriptions — a view
 *   sai do que passou pelo `EventBus`, sem consultar o banco. `onPostCreated` publica sempre o post
 *   como ele nasceu (v1, sem tags); a tag padrão chega em seguida por `onPostUpdated`.
 */
@Injectable()
export class PostViewMapper {
  fromPost(post: Post): PostView {
    return Object.assign(new PostView(), {
      id: post.id,
      title: post.title,
      content: post.content,
      author: post.author,
      createdAt: post.createdAt,
      updatedAt: post.updatedAt,
      version: post.version,
      tags: post.tags.map(({ tagId, name }) => ({ id: tagId, name })),
    });
  }

  fromCreatedEvent(event: PostCreatedEvent): PostView {
    return Object.assign(new PostView(), {
      id: event.postId,
      title: event.title,
      content: event.content,
      author: event.author,
      createdAt: event.occurredAt,
      updatedAt: event.occurredAt,
      version: 1,
      tags: [],
    });
  }

  fromUpdatedEvent(event: PostUpdatedEvent): PostView {
    return Object.assign(new PostView(), {
      id: event.postId,
      title: event.title,
      content: event.content,
      author: event.author,
      createdAt: event.createdAt,
      updatedAt: event.occurredAt,
      version: event.version,
      tags: event.tags.map(({ tagId, name }) => ({ id: tagId, name })),
    });
  }
}
