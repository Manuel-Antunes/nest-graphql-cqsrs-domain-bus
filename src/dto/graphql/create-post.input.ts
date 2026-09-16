import { AutoMap } from '@automapper/classes';
import { z } from 'zod';
import { InheritValidatedMetadata, ValidatedDto } from '../../validated-dto/mixins';
import { AUTOMAP_REGISTRY } from './automap.registry';
import { PostContent } from '../../domain/post/vo/post-content';
import { PostTitle } from '../../domain/post/vo/post-title';

/** O shape de `createPost`: os dois value objects de texto, embutidos. */
const CreatePostInputSchema = z.object({
  title: PostTitle.field({ DECORATOR_REGISTRY: AUTOMAP_REGISTRY, decorators: [AutoMap()] }),
  content: PostContent.field({ DECORATOR_REGISTRY: AUTOMAP_REGISTRY, decorators: [AutoMap()] }),
});

/**
 * Entrada de `createPost`. Espelha o `input CreatePostInput` do schema e **não acrescenta uma altura
 * de validação**: os value objects embutidos aqui envolvem os mesmos schemas do domínio, e o
 * construtor deles normaliza sem lançar. Quem manda um título em branco continua recebendo
 * `BAD_USER_INPUT` com a mensagem do `PostTitle` vinda do domínio, traduzida pelo
 * `DomainExceptionFilter`.
 *
 * O que este DTO dá é o **tipo**: `input.title` é um `PostTitle`, e não uma `string`. É o que permite
 * o `PostProfile` desembrulhar o valor sozinho, pelo conversor de value objects, sem um `forMember`
 * por campo. O que ele já não carrega é o `@InputType`: quem declara
 * `input CreatePostInput { title: String! content: String! }` é o schema, e o Nest entrega os `@Args`
 * **crus** — quem os materializa nesta classe antes do mapeamento é o `preMap` da estratégia (ver
 * `validatedDtoClasses`).
 *
 * Repare no que **não** está aqui: o autor. Ele vem da sessão, não do corpo — quem escreve é quem
 * está autenticado, e não quem se declara.
 */
@InheritValidatedMetadata()
export class CreatePostInput extends ValidatedDto(CreatePostInputSchema, {
  DECORATOR_REGISTRY: AUTOMAP_REGISTRY,
}) {}
