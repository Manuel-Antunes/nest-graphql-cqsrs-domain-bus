import { defineEntity, p } from '@mikro-orm/core';
import { Tag } from '../../../../domain/tag/tag.entity';
import { TagId } from '../../../../domain/tag/vo/tag-id';
import { TAG_NAME_MAX_LENGTH, TagName } from '../../../../domain/tag/vo/tag-name';
import { valueObjectType } from '../helpers/value-object-type';

const TagIdType = valueObjectType(TagId, { columnType: 'varchar(36)' });
const TagNameType = valueObjectType(TagName, { columnType: `varchar(${TAG_NAME_MAX_LENGTH})` });

/**
 * O mapeamento da Tag: o `defineEntity` do MikroORM apontando para a classe de domínio.
 *
 * Continua **não existindo** uma entidade espelho — `class: Tag` é a mesma classe que o domínio usa.
 * O que mora aqui é só a decisão de deploy: qual coluna, de que tipo, com que índice.
 */
export const TagSchema = defineEntity({
  class: Tag,
  tableName: 'tags',
  forceConstructor: true,
  properties: {
    id: p.type(TagIdType).primary(),
    name: p.type(TagNameType).unique(),
    createdAt: p.datetime(),
  },
});
