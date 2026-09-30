import { attachment } from '@nestposts/asset/infrastructure/database/attachment.type';
import {
  defineEntity,
  p,
  TENANT_SCHEMA,
  valueObjectType,
} from '@nestposts/database';
import { ZodEntity } from '@nestposts/platform/domain/shared/zod-entity';
import {
  activeFilter,
  softDeleteIndex,
  softDeleteProperty,
} from '@nestposts/platform/infrastructure/persistence/soft-delete/soft-delete-orm.entity';
import { AuthorshipEntitySchema } from '@nestposts/users/infrastructure/persistence/entities/user-orm.entity';

import { InvalidPostException } from '../../../domain/post/exception/invalid-post.exception';
import { Post } from '../../../domain/post/post.entity';
import { PostSchema } from '../../../domain/post/schemas/post.schema';
import { POST_TITLE_MAX_LENGTH } from '../../../domain/post/schemas/post-title.schema';
import { PostContent } from '../../../domain/post/vo/post-content';
import { PostId } from '../../../domain/post/vo/post-id';
import { PostTitle } from '../../../domain/post/vo/post-title';
import { TagSchema } from './tag-orm.entity';

export const PostEntitySchema = defineEntity({
  class: Post,
  tableName: 'posts',
  schema: TENANT_SCHEMA,
  forceConstructor: true,
  properties: {
    id: p
      .type(valueObjectType(PostId, { columnType: 'varchar(36)' }))
      .primary(),
    title: p.type(
      valueObjectType(PostTitle, {
        columnType: `varchar(${POST_TITLE_MAX_LENGTH})`,
      }),
    ),
    content: p.type(valueObjectType(PostContent, { columnType: 'text' })),
    asset: attachment({
      disk: 'public',
      folder: 'assets',
      preComputeUrl: true,
    }).nullable(),
    author: () => p.manyToOne(AuthorshipEntitySchema).ref(),
    createdAt: p.datetime(),
    updatedAt: p.datetime(),
    version: p.integer(),
    publishedAt: p.datetime().nullable(),
    deleted: () => softDeleteProperty(),
    tags: () => p.manyToMany(TagSchema).owner(),
  },
  filters: activeFilter,
  indexes: [{ properties: ['createdAt', 'id'] }, softDeleteIndex],
});

ZodEntity(
  Post,
  PostSchema,
  (error) => new InvalidPostException('post inválido', { cause: error }),
);
