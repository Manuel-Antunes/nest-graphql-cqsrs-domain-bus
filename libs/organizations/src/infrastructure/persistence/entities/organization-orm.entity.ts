import {
  defineEntity,
  p,
  SYSTEM_SCHEMA,
  valueObjectType,
} from '@nestposts/database';

import { Organization } from '../../../domain/organization/organization.entity';
import { ORGANIZATION_ID_MAX_LENGTH } from '../../../domain/organization/schemas/organization-id.schema';
import { ORGANIZATION_NAME_MAX_LENGTH } from '../../../domain/organization/schemas/organization-name.schema';
import { ORGANIZATION_SLUG_MAX_LENGTH } from '../../../domain/organization/schemas/organization-slug.schema';
import { OrganizationId } from '../../../domain/organization/vo/organization-id';
import { OrganizationName } from '../../../domain/organization/vo/organization-name';
import { OrganizationSlug } from '../../../domain/organization/vo/organization-slug';
import { OrganizationChatwootSyncTrigger } from '../triggers/chatwoot-sync.triggers';
import { OrganizationTenantSchemaTrigger } from '../triggers/tenant-schema.trigger';

export const OrganizationEntitySchema = defineEntity({
  class: Organization,
  tableName: 'organization',
  schema: SYSTEM_SCHEMA,
  forceConstructor: true,
  properties: {
    id: p
      .type(
        valueObjectType(OrganizationId, {
          columnType: `varchar(${ORGANIZATION_ID_MAX_LENGTH})`,
        }),
      )
      .primary(),
    name: p.type(
      valueObjectType(OrganizationName, {
        columnType: `varchar(${ORGANIZATION_NAME_MAX_LENGTH})`,
      }),
    ),
    slug: p
      .type(
        valueObjectType(OrganizationSlug, {
          columnType: `varchar(${ORGANIZATION_SLUG_MAX_LENGTH})`,
        }),
      )
      .unique(),
    logo: p.string().nullable(),
    metadata: p.text().nullable(),
    createdAt: p.datetime(),
  },
  triggers: [OrganizationTenantSchemaTrigger, OrganizationChatwootSyncTrigger],
});
