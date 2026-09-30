import type { TriggerDef } from '@nestposts/database';
import { TENANT_SCHEMA_PREFIX } from '@nestposts/database';

import type { Organization } from '../../../domain/organization/organization.entity';

export const ORGANIZATION_TENANT_SCHEMA_TRIGGER = 'organization_tenant_schema';

export const OrganizationTenantSchemaTrigger: TriggerDef<Organization> = {
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
};
