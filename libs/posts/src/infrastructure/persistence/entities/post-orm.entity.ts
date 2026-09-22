import { defineEntity, p } from "@nestposts/database";
import { Post } from "../../../domain/post/post.entity";
import { InvalidPostException } from "../../../domain/post/exception/invalid-post.exception";
import { PostSchema } from "../../../domain/post/schemas/post.schema";
import { ZodEntity } from "@nestposts/platform/domain/shared/zod-entity";
import { PostContent } from "../../../domain/post/vo/post-content";
import { PostId } from "../../../domain/post/vo/post-id";
import { POST_TITLE_MAX_LENGTH } from "../../../domain/post/schemas/post-title.schema";
import { PostTitle } from "../../../domain/post/vo/post-title";
import {
  activeFilter,
  softDeleteIndex,
  softDeleteProperty,
} from "@nestposts/platform/infrastructure/persistence/soft-delete/soft-delete-orm.entity";
import { TagSchema } from "./tag-orm.entity";
import { AuthorshipEntitySchema } from "@nestposts/users/infrastructure/persistence/entities/user-orm.entity";
import { valueObjectType } from "@nestposts/database";

const PostIdType = valueObjectType(PostId, { columnType: "varchar(36)" });
const PostTitleType = valueObjectType(PostTitle, {
  columnType: `varchar(${POST_TITLE_MAX_LENGTH})`,
});
const PostContentType = valueObjectType(PostContent, { columnType: "text" });

export const PostEntitySchema = defineEntity({
  class: Post,
  tableName: "posts",
  forceConstructor: true,
  properties: {
    id: p.type(PostIdType).primary(),
    title: p.type(PostTitleType),
    content: p.type(PostContentType),
    author: () => p.manyToOne(AuthorshipEntitySchema).ref(),
    createdAt: p.datetime(),
    updatedAt: p.datetime(),
    version: p.integer(),
    publishedAt: p.datetime().nullable(),
    deleted: () => softDeleteProperty(),
    tags: () => p.manyToMany(TagSchema).owner(),
  },
  filters: activeFilter,
  indexes: [{ properties: ["createdAt", "id"] }, softDeleteIndex],
});

ZodEntity(
  Post,
  PostSchema,
  error => new InvalidPostException("post inválido", { cause: error }),
);
