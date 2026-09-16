import type { Tag } from './tag.entity';
import type { TagId } from './vo/tag-id';
import type { TagName } from './vo/tag-name';

export abstract class TagRepository {
  abstract save(tag: Tag): Promise<void>;
  abstract findById(tagId: TagId): Promise<Tag | null>;
  abstract findByName(name: TagName): Promise<Tag | null>;
}
