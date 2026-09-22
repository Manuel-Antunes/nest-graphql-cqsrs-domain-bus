import { TENANT_SCHEMA_PREFIX, defineEntity, p, valueObjectType } from '@nestposts/database';
import { Organization } from '../../../domain/organization/organization.entity';
import { ORGANIZATION_ID_MAX_LENGTH } from '../../../domain/organization/schemas/organization-id.schema';
import { ORGANIZATION_NAME_MAX_LENGTH } from '../../../domain/organization/schemas/organization-name.schema';
import { ORGANIZATION_SLUG_MAX_LENGTH } from '../../../domain/organization/schemas/organization-slug.schema';
import { OrganizationId } from '../../../domain/organization/vo/organization-id';
import { OrganizationName } from '../../../domain/organization/vo/organization-name';
import { OrganizationSlug } from '../../../domain/organization/vo/organization-slug';

export const OrganizationIdType = valueObjectType(OrganizationId, {
  columnType: `varchar(${ORGANIZATION_ID_MAX_LENGTH})`,
});

const OrganizationNameType = valueObjectType(OrganizationName, {
  columnType: `varchar(${ORGANIZATION_NAME_MAX_LENGTH})`,
});

const OrganizationSlugType = valueObjectType(OrganizationSlug, {
  columnType: `varchar(${ORGANIZATION_SLUG_MAX_LENGTH})`,
});

export const ORGANIZATION_TENANT_SCHEMA_TRIGGER = 'organization_tenant_schema';

export const OrganizationEntitySchema = defineEntity({
  class: Organization,
  tableName: 'organization',
  forceConstructor: true,
  properties: {
    id: p.type(OrganizationIdType).primary(),
    name: p.type(OrganizationNameType),
    slug: p.type(OrganizationSlugType).unique(),
    logo: p.string().nullable(),
    metadata: p.text().nullable(),
    createdAt: p.datetime(),
  },
  triggers: [
    {
      name: ORGANIZATION_TENANT_SCHEMA_TRIGGER,
      timing: 'after',
      events: ['insert', 'delete'],
      forEach: 'row',
      body: (columns) => `
        IF TG_OP = 'INSERT' THEN
          EXECUTE format('create schema if not exists %I', '${TENANT_SCHEMA_PREFIX}_' || NEW.${columns.slug});
        ELSIF TG_OP = 'DELETE' THEN
          EXECUTE format('drop schema if exists %I cascade', '${TENANT_SCHEMA_PREFIX}_' || OLD.${columns.slug});
        END IF;
        RETURN NULL;
      `,
    },
  ],
});
