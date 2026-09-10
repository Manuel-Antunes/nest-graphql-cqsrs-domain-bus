import { z } from 'zod';
import { InheritValidatedMetadata, ValidatedDto } from '../../validated-dto/mixins';
import { PostContent } from '../../domain/post/vo/post-content';
import { PostTitle } from '../../domain/post/vo/post-title';

/** O shape de `createPost`: os dois value objects de texto, embutidos. */
const CreatePostInputSchema = z.object({
  title: PostTitle.field(),
  content: PostContent.field(),
});

/**
 * Entrada de `createPost`. Espelha o `input CreatePostInput` do schema e **não acrescenta uma altura
 * de validação**: os value objects embutidos aqui envolvem os mesmos schemas do domínio, e o
 * construtor deles normaliza sem lançar. Quem manda um título em branco continua recebendo
 * `BAD_USER_INPUT` com a mensagem do `PostTitle` vinda do domínio, traduzida pelo
 * `DomainExceptionFilter`.
 *
 * O que este DTO dá é o **tipo**: `input.title` é um `PostTitle`, e não uma `string` — o
 * `PostInputMapper` lê o valor pelo `.value`, sem um `parse` avulso no caminho. O que ele já não
 * carrega é o `@InputType`: quem declara `input CreatePostInput { title: String! content: String! }`
 * é o schema, e o Nest entrega os `@Args` crus para o mapper materializar.
 *
 * Repare no que **não** está aqui: o autor. Ele vem da sessão, não do corpo — quem escreve é quem
 * está autenticado, e não quem se declara.
 */
@InheritValidatedMetadata()
export class CreatePostInput extends ValidatedDto(CreatePostInputSchema) {}
