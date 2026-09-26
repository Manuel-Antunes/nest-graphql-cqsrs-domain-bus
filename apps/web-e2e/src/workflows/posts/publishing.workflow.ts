import type { GraphqlClient } from '../../infrastructure/graphql/graphql-client';
import {
  CreatePost,
  RetitlePost,
} from '../../infrastructure/graphql/operations/posts.operations';
import type { PostDraft } from '../../model/post';
import type { WebApp } from '../../pages/web-app';

export class Publishing {
  constructor(
    private readonly app: WebApp,
    private readonly graphql: GraphqlClient,
  ) {}

  async publishInTheForm(draft: PostDraft): Promise<string> {
    await this.app.newPost.open();
    return this.app.newPost.publish(draft);
  }

  async publishThroughTheApi(title: string, content = 'oi'): Promise<string> {
    const { createPost } = await this.graphql.data(CreatePost, {
      input: { title, content },
    });
    return createPost.id;
  }

  async retitle(postId: string, title: string): Promise<number> {
    const { updatePost } = await this.graphql.data(RetitlePost, {
      input: { id: postId, title },
    });
    return updatePost.version;
  }
}
