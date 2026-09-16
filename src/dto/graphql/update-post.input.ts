import { AutoMap } from '@automapper/classes';
import { z } from 'zod';
import { InheritValidatedMetadata, ValidatedDto } from '../../validated-dto/mixins';
import { AUTOMAP_REGISTRY } from './automap.registry';
import { PostContent } from '../../domain/post/vo/post-content';
import { PostId } from '../../domain/post/vo/post-id';
import { PostTitle } from '../../domain/post/vo/post-title';

const UpdatePostInputSchema = z.object({
  id: PostId.field({ DECORATOR_REGISTRY: AUTOMAP_REGISTRY, decorators: [AutoMap()] }),
  title: PostTitle.field()
    .nullish()
    .register(AUTOMAP_REGISTRY, { decorators: [AutoMap()] }),
  content: PostContent.field()
    .nullish()
    .register(AUTOMAP_REGISTRY, { decorators: [AutoMap()] }),
});

@InheritValidatedMetadata()
export class UpdatePostInput extends ValidatedDto(UpdatePostInputSchema, {
  DECORATOR_REGISTRY: AUTOMAP_REGISTRY,
}) {}
