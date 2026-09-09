import { Field, ID, InputType } from '@nestjs/graphql';

/** Entrada de `updatePost`. `null`/ausente em `title`/`content` significa "manter o valor atual". */
@InputType()
export class UpdatePostInput {
  @Field(() => ID)
  id: string;

  @Field(() => String, { nullable: true, description: 'null = manter o título atual' })
  title?: string | null;

  @Field(() => String, { nullable: true, description: 'null = manter o conteúdo atual' })
  content?: string | null;
}
