import type { Tag } from './tag.entity';
import type { TagId } from './vo/tag-id';
import type { TagName } from './vo/tag-name';

/** Porta do repositório de Tags — classe abstrata para servir de token de injeção (ver `PostRepository`). */
export abstract class TagRepository {
  abstract save(tag: Tag): Promise<void>;
  abstract findById(tagId: TagId): Promise<Tag | null>;
  abstract findByName(name: TagName): Promise<Tag | null>;
}
