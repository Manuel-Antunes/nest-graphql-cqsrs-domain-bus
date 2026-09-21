import { AutoMap } from "@automapper/classes";
import { BaseEntity } from "@mikro-orm/core";
import { WithAggregateRoot } from "@nestjs/cqrs";
import { TagCreatedEvent } from "./event/tag-created.event";
import { InvalidTagException } from "./exception/invalid-tag.exception";
import { TagId } from "./vo/tag-id";
import { TagName } from "./vo/tag-name";

export const DEFAULT_TAG_NAME = "Untagged";

export const DEFAULT_TAG_ID = "00000000-0000-4000-8000-000000000001";

export class Tag extends WithAggregateRoot(BaseEntity)<TagCreatedEvent> {
  @AutoMap(() => TagId)
  id!: TagId;
  @AutoMap(() => TagName)
  name!: TagName;
  @AutoMap()
  createdAt!: Date;

  static reference(id: TagId, name: TagName): Tag {
    const tag = new Tag();
    tag.id = id;
    tag.name = name;
    return tag;
  }

  static default(): Tag {
    return Tag.reference(TagId.parse(DEFAULT_TAG_ID), TagName.parse(DEFAULT_TAG_NAME));
  }

  static create(id: TagId, name: string, now: Date): Tag {
    const parsed = TagName.safeParse(name);
    if (!parsed.success) {
      throw new InvalidTagException('nome de tag inválido', { cause: parsed.error });
    }
    const tag = new Tag();
    tag.apply(new TagCreatedEvent(id.value, parsed.data.value, now));
    return tag;
  }

  onTagCreatedEvent(event: TagCreatedEvent): void {
    this.id = TagId.parse(event.tagId);
    this.name = TagName.parse(event.name);
    this.createdAt = event.occurredAt;
  }
}
