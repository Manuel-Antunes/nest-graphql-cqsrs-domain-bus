import { AutoMap } from "@automapper/classes";
import { z } from "zod";
import {
  InheritValidatedMetadata,
  ValidatedDto,
} from "../../validated-dto/mixins";
import { AUTOMAP_REGISTRY } from "./automap.registry";
import { PostContent } from "../../domain/post/vo/post-content";
import { PostId } from "../../domain/post/vo/post-id";
import { PostTitle } from "../../domain/post/vo/post-title";
import { UserId } from "../../domain/user/vo/user-id";
import { TagView } from "./tag.view";

const PostViewSchema = z.object({
  id: PostId.field({ DECORATOR_REGISTRY: AUTOMAP_REGISTRY, decorators: [AutoMap()] }),
  title: PostTitle.field({ DECORATOR_REGISTRY: AUTOMAP_REGISTRY, decorators: [AutoMap()] }),
  content: PostContent.field({ DECORATOR_REGISTRY: AUTOMAP_REGISTRY, decorators: [AutoMap()] }),
  authorId: UserId.field({ DECORATOR_REGISTRY: AUTOMAP_REGISTRY, decorators: [AutoMap()] }),
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
  { tags: TagView[] }
>(PostViewSchema, { DECORATOR_REGISTRY: AUTOMAP_REGISTRY }) {
  @AutoMap((): [typeof TagView] => [TagView])
  declare tags: TagView[];
}
