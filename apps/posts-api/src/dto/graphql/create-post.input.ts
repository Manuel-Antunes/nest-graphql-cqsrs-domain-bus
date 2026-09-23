import { AutoMap } from '@automapper/classes';
import { PostContent } from '@nestposts/posts/domain/post/vo/post-content';
import { PostTitle } from '@nestposts/posts/domain/post/vo/post-title';
import {
  InheritValidatedMetadata,
  ValidatedDto,
} from '@nestposts/validated-dto/mixins';
import { z } from 'zod';

import { AUTOMAP_REGISTRY } from './automap.registry';

const CreatePostInputSchema = z.object({
  title: PostTitle.field({
    DECORATOR_REGISTRY: AUTOMAP_REGISTRY,
    decorators: [AutoMap()],
  }),
  content: PostContent.field({
    DECORATOR_REGISTRY: AUTOMAP_REGISTRY,
    decorators: [AutoMap()],
  }),
});

@InheritValidatedMetadata()
export class CreatePostInput extends ValidatedDto(CreatePostInputSchema, {
  DECORATOR_REGISTRY: AUTOMAP_REGISTRY,
}) {}
