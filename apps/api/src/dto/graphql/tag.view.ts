import { Field, ID, ObjectType } from '@nestjs/graphql';

/** Uma tag como o GraphQL a vê: id e nome. Serve tanto para a `Tag` agregada quanto para o `TagRef` copiado no Post. */
@ObjectType('Tag', { description: 'Uma tag. Agregado próprio: tem id e eventos independentes do post.' })
export class TagView {
  @Field(() => ID)
  id: string;

  @Field()
  name: string;
}
