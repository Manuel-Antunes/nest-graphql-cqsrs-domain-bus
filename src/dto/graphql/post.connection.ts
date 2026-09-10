import type { ConnectionType } from './connection';
import type { PostView } from './post.view';
import type { TagView } from './tag.view';

/** `posts(first, after)`: uma página de posts em ordem de criação. */
export type PostConnection = ConnectionType<PostView>;

/** `Post.tags(first, after)`: uma página das tags de um post, recortada em memória. */
export type TagConnection = ConnectionType<TagView>;
