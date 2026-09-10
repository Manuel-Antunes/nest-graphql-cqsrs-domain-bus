import { z } from 'zod';
import { InheritValidatedMetadata, ValidatedDto } from '../../validated-dto/mixins';
import { PostContent } from '../../domain/post/vo/post-content';
import { PostId } from '../../domain/post/vo/post-id';
import { PostTitle } from '../../domain/post/vo/post-title';

/**
 * O shape de `updatePost`. Os dois campos opcionais são o value object **embrulhado** em
 * `.nullish()` — o value object embutido continua sendo achado por baixo do embrulho, e o `null`
 * explícito sobrevive à travessia.
 */
const UpdatePostInputSchema = z.object({
  id: PostId.field(),
  title: PostTitle.field().nullish(),
  content: PostContent.field().nullish(),
});

/** Entrada de `updatePost`. `null`/ausente em `title`/`content` significa "manter o valor atual". */
@InheritValidatedMetadata()
export class UpdatePostInput extends ValidatedDto(UpdatePostInputSchema) {}
