import { Injectable } from '@nestjs/common';
import { CreatePostCommand } from '../../application/post/command/create-post.command';
import { UpdatePostCommand } from '../../application/post/command/update-post.command';
import { PostId } from '../../domain/post/vo/post-id';
import type { Author } from '../../domain/user/author.entity';
import { CreatePostInput } from '../../dto/graphql/create-post.input';
import { UpdatePostInput } from '../../dto/graphql/update-post.input';

/**
 * Input GraphQL → command (protocolo → aplicação). O salto é pequeno, mas é um lugar só: o resolver
 * não monta command, e o command não conhece o `@InputType`.
 *
 * ## Por que o `new CreatePostInput(input)`
 * O @nestjs/graphql entrega os `@Args` como **objeto cru** — ele não instancia a classe do
 * `@InputType`. Reconstruir o DTO aqui é o que materializa os value objects embutidos, e é por isso
 * que este mapper não tem mais nenhum `parse` avulso: `input.title` é um `PostTitle`, e o valor que o
 * command quer é o `.value` dele. Construir não lança — quem valida continua sendo o domínio.
 *
 * A exceção é o `id`: `assertValid()` mantém a regra que já estava aqui — um id que não é UUID nem
 * chega ao command.
 *
 * O autor entra por parâmetro, e não pelo `input`: ele vem da **sessão**, e o resolver o passa já
 * como `Author` — o upcast dele é a guarda. É o que impede alguém publicar em nome de outro
 * simplesmente escrevendo outro nome no corpo. O que segue para o command é o retrato (id e nome), e
 * não o agregado: quem valida que aquele id é de um autor é a chave estrangeira.
 */
@Injectable()
export class PostInputMapper {
  toCreateCommand(input: CreatePostInput, author: Author): CreatePostCommand.CreatePost {
    const { title, content } = new CreatePostInput(input);
    return new CreatePostCommand.CreatePost(
      PostId.generate(),
      title.value,
      content.value,
      author.id,
      author.name,
    );
  }

  toUpdateCommand(input: UpdatePostInput): UpdatePostCommand.UpdatePost {
    const { id, title, content } = new UpdatePostInput(input);
    return new UpdatePostCommand.UpdatePost(
      id.assertValid(),
      title?.value,
      content?.value,
    );
  }
}
