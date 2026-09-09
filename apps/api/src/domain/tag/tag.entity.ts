import { defineEntity, p } from '@mikro-orm/core';
import { AggregateEntity } from '../shared/aggregate-entity';
import { TagCreatedEvent } from './event/tag-created.event';
import { InvalidTagException } from './exception/invalid-tag.exception';
import { TagId } from './vo/tag-id';
import { TagName } from './vo/tag-name';

/** Nome da tag atribuída a um post que não tem nenhuma outra. */
export const DEFAULT_TAG_NAME = 'Untagged';

/**
 * A Tag: como o `Post`, uma classe só — entidade de domínio, aggregate root e mapeamento do ORM.
 *
 * Agregado independente. Um Post guarda apenas uma cópia do id e do nome (`TagRef`); nenhuma relação
 * do ORM liga os dois, para que a fronteira de consistência de cada um continue sendo só a sua.
 *
 * Hoje uma Tag só nasce — não há evento que a renomeie ou apague, então todo o estado vem do
 * `TagCreatedEvent`.
 */
export class Tag extends AggregateEntity<TagCreatedEvent> {
  id!: TagId;
  name!: TagName;
  createdAt!: Date;

  // ---- decidir --------------------------------------------------------------------------------

  /**
   * Construtor nomeado da Tag: valida o nome, dispara `TagCreatedEvent` e devolve a Tag pronta para
   * ser salva por quem chamou.
   *
   * @throws InvalidTagException se o nome violar a invariante
   */
  static create(id: TagId, name: string, now: Date): Tag {
    const parsed = TagName.safeParse(name);
    if (!parsed.success) {
      throw InvalidTagException.fromZod(parsed.error);
    }
    const tag = new Tag();
    tag.apply(new TagCreatedEvent(id, parsed.data, now));
    return tag;
  }

  // ---- evoluir --------------------------------------------------------------------------------

  onTagCreatedEvent(event: TagCreatedEvent): void {
    this.id = TagId.parse(event.tagId);
    this.name = TagName.parse(event.name);
    this.createdAt = event.occurredAt;
  }
}

export const TagSchema = defineEntity({
  class: Tag,
  tableName: 'tags',
  forceConstructor: true,
  properties: {
    id: p.string().primary().length(36),
    name: p.string().length(50).unique(),
    createdAt: p.datetime(),
  },
});
