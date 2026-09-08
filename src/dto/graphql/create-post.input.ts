import { Field, InputType } from '@nestjs/graphql';

/**
 * Entrada de `createPost`. Espelha o `input` do schema; não valida nada além do que o GraphQL já
 * valida (tipos e obrigatoriedade). A validação que **vale** é a dos value objects do domínio — quem
 * manda um título em branco recebe `BAD_USER_INPUT` com a mensagem do `PostTitle`, traduzida pelo
 * `DomainExceptionFilter`. Uma altura só de validação, e a do domínio.
 */
@InputType()
export class CreatePostInput {
  @Field()
  title: string;

  @Field()
  content: string;

  @Field()
  author: string;
}
