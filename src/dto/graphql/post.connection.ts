import type { ConnectionType } from './connection';
import type { PostView } from './post.view';
import type { TagView } from './tag.view';

export type PostConnection = ConnectionType<PostView>;

export type TagConnection = ConnectionType<TagView>;
