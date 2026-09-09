import { Field, GraphQLISODateTime, ID, Int, ObjectType } from '@nestjs/graphql';
import type { TagView } from './tag.view';

/**
 * Read model de um Post — o mesmo shape em queries, mutations e subscriptions. Achata os value objects
 * do domínio para o protocolo: `title` é `String`, não `PostTitle`.
 *
 * `tags` não é `@Field`: o campo `Post.tags(first, after)` do schema é resolvido à parte, pelo
 * `PostTagsResolver`, como cursor connection. A lista fica aqui só para o resolver recortar.
 */
@ObjectType('Post', { description: 'Read model de um Post. Mesmo shape em queries, mutations e subscriptions.' })
export class PostView {
  @Field(() => ID)
  id: string;

  @Field()
  title: string;

  @Field()
  content: string;

  @Field()
  author: string;

  @Field(() => GraphQLISODateTime)
  createdAt: Date;

  @Field(() => GraphQLISODateTime)
  updatedAt: Date;

  @Field(() => Int, { description: 'Quantidade de eventos aplicados (1 = só criado)' })
  version: number;

  tags: TagView[];
}
