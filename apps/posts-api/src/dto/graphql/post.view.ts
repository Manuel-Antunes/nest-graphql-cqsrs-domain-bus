import { AutoMap } from '@automapper/classes';
import { PostContent } from '@nestposts/posts/domain/post/vo/post-content';
import { PostId } from '@nestposts/posts/domain/post/vo/post-id';
import { PostTitle } from '@nestposts/posts/domain/post/vo/post-title';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';
import {
  InheritValidatedMetadata,
  ValidatedDto,
} from '@nestposts/validated-dto/mixins';
import { z } from 'zod';

import { AssetView } from './asset.view';
import { AUTOMAP_REGISTRY } from './automap.registry';
import { TagView } from './tag.view';

const PostViewSchema = z.object({
  id: PostId.field({
    DECORATOR_REGISTRY: AUTOMAP_REGISTRY,
    decorators: [AutoMap()],
  }),
  title: PostTitle.field({
    DECORATOR_REGISTRY: AUTOMAP_REGISTRY,
    decorators: [AutoMap()],
  }),
  content: PostContent.field({
    DECORATOR_REGISTRY: AUTOMAP_REGISTRY,
    decorators: [AutoMap()],
  }),
  authorId: UserId.field({
    DECORATOR_REGISTRY: AUTOMAP_REGISTRY,
    decorators: [AutoMap()],
  }),
  createdAt: z.date().register(AUTOMAP_REGISTRY, { decorators: [AutoMap()] }),
  updatedAt: z.date().register(AUTOMAP_REGISTRY, { decorators: [AutoMap()] }),
  version: z
    .number()
    .int()
    .positive()
    .register(AUTOMAP_REGISTRY, { decorators: [AutoMap()] }),
});

@InheritValidatedMetadata()
export class PostView extends ValidatedDto<
  typeof PostViewSchema,
  { tags: TagView[]; asset?: AssetView | null }
>(PostViewSchema, { DECORATOR_REGISTRY: AUTOMAP_REGISTRY }) {
  @AutoMap((): [typeof TagView] => [TagView])
  declare tags: TagView[];

  @AutoMap(() => AssetView)
  declare asset?: AssetView | null;
}
