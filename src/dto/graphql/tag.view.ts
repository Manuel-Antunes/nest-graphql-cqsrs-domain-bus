import { AutoMap } from '@automapper/classes';
import { z } from 'zod';
import { InheritValidatedMetadata, ValidatedDto } from '../../validated-dto/mixins';
import { AUTOMAP_REGISTRY } from './automap.registry';
import { TagId } from '../../domain/tag/vo/tag-id';
import { TagName } from '../../domain/tag/vo/tag-name';

const TagViewSchema = z.object({
  id: TagId.field({ DECORATOR_REGISTRY: AUTOMAP_REGISTRY, decorators: [AutoMap()] }),
  name: TagName.field({ DECORATOR_REGISTRY: AUTOMAP_REGISTRY, decorators: [AutoMap()] }),
});


@InheritValidatedMetadata()
export class TagView extends ValidatedDto(TagViewSchema, {
  DECORATOR_REGISTRY: AUTOMAP_REGISTRY,
}) {}
