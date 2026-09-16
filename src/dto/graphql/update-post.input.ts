import { AutoMap } from '@automapper/classes';
import { z } from 'zod';
import { InheritValidatedMetadata, ValidatedDto } from '../../validated-dto/mixins';
import { AUTOMAP_REGISTRY } from './automap.registry';
import { PostContent } from '../../domain/post/vo/post-content';
import { PostId } from '../../domain/post/vo/post-id';
import { PostTitle } from '../../domain/post/vo/post-title';

/**
 * O shape de `updatePost`. Os dois campos opcionais são o value object **embrulhado** em
 * `.nullish()` — o value object embutido continua sendo achado por baixo do embrulho, e o `null`
 * explícito sobrevive à travessia.
 */
const UpdatePostInputSchema = z.object({
  id: PostId.field({ DECORATOR_REGISTRY: AUTOMAP_REGISTRY, decorators: [AutoMap()] }),
  // O `.register` vai por fora do `.nullish()`: o registry é lido pelo schema que está **no shape**, e
  // o que está lá é o embrulho, não o campo de dentro.
  title: PostTitle.field()
    .nullish()
    .register(AUTOMAP_REGISTRY, { decorators: [AutoMap()] }),
  content: PostContent.field()
    .nullish()
    .register(AUTOMAP_REGISTRY, { decorators: [AutoMap()] }),
});

/** Entrada de `updatePost`. `null`/ausente em `title`/`content` significa "manter o valor atual". */
@InheritValidatedMetadata()
export class UpdatePostInput extends ValidatedDto(UpdatePostInputSchema, {
  DECORATOR_REGISTRY: AUTOMAP_REGISTRY,
}) {}
