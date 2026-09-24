import type { MigrationObject } from '@mikro-orm/core';

import { Migration20260924124449_tenant } from './Migration20260924124449_tenant';
import { Migration20260924124450_default_tag } from './Migration20260924124450_default_tag';

export const tenantMigrations: MigrationObject[] = [
  {
    name: 'Migration20260924124449_tenant',
    class: Migration20260924124449_tenant,
  },
  {
    name: 'Migration20260924124450_default_tag',
    class: Migration20260924124450_default_tag,
  },
];
