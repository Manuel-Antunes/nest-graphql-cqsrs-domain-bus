import {
  defineEntity,
  p,
  TENANT_SCHEMA,
  valueObjectType,
} from '@nestposts/database';

import { TAG_NAME_MAX_LENGTH } from '../../../domain/tag/schemas/tag-name.schema';
import { Tag } from '../../../domain/tag/tag.entity';
import { TagId } from '../../../domain/tag/vo/tag-id';
import { TagName } from '../../../domain/tag/vo/tag-name';

export const TagSchema = defineEntity({
  class: Tag,
  tableName: 'tags',
  schema: TENANT_SCHEMA,
  forceConstructor: true,
  properties: {
    id: p.type(valueObjectType(TagId, { columnType: 'varchar(36)' })).primary(),
    name: p
      .type(
        valueObjectType(TagName, {
          columnType: `varchar(${TAG_NAME_MAX_LENGTH})`,
        }),
      )
      .unique(),
    createdAt: p.datetime(),
  },
});
