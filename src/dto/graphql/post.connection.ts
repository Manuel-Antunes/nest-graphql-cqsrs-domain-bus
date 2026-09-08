import { ObjectType } from '@nestjs/graphql';
import { Connection } from './connection';
import { PostView } from './post.view';
import { TagView } from './tag.view';

/** `posts(first, after)`: uma página de posts em ordem de criação. */
@ObjectType()
export class PostConnection extends Connection(PostView, 'Post') {}

/** `Post.tags(first, after)`: uma página das tags de um post, recortada em memória. */
@ObjectType()
export class TagConnection extends Connection(TagView, 'Tag') {}
