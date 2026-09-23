import { AutoMap } from '@automapper/classes';
import { TagId } from '@nestposts/posts/domain/tag/vo/tag-id';
import { TagName } from '@nestposts/posts/domain/tag/vo/tag-name';
import {
  InheritValidatedMetadata,
  ValidatedDto,
} from '@nestposts/validated-dto/mixins';
import { z } from 'zod';

import { AUTOMAP_REGISTRY } from './automap.registry';

const TagViewSchema = z.object({
  id: TagId.field({
    DECORATOR_REGISTRY: AUTOMAP_REGISTRY,
    decorators: [AutoMap()],
  }),
  name: TagName.field({
    DECORATOR_REGISTRY: AUTOMAP_REGISTRY,
    decorators: [AutoMap()],
  }),
});

@InheritValidatedMetadata()
export class TagView extends ValidatedDto(TagViewSchema, {
  DECORATOR_REGISTRY: AUTOMAP_REGISTRY,
}) {}
