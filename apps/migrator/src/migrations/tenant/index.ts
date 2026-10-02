import type { MigrationObject } from '@mikro-orm/core';

import { Migration20260924124449_tenant } from './Migration20260924124449_tenant';
import { Migration20260924124450_default_tag } from './Migration20260924124450_default_tag';
import { Migration20260925012004_calendar_events } from './Migration20260925012004_calendar_events';
import { Migration20260926174755_calendar_event_sequence } from './Migration20260926174755_calendar_event_sequence';
import { Migration20260928130001_users } from './Migration20260928130001_users';
import { Migration20260929225922_clients } from './Migration20260929225922_clients';
import { Migration20261002160000_chats } from './Migration20261002160000_chats';

export const tenantMigrations: MigrationObject[] = [
  {
    name: 'Migration20260924124449_tenant',
    class: Migration20260924124449_tenant,
  },
  {
    name: 'Migration20260924124450_default_tag',
    class: Migration20260924124450_default_tag,
  },
  {
    name: 'Migration20260925012004_calendar_events',
    class: Migration20260925012004_calendar_events,
  },
  {
    name: 'Migration20260926174755_calendar_event_sequence',
    class: Migration20260926174755_calendar_event_sequence,
  },
  {
    name: 'Migration20260928130001_users',
    class: Migration20260928130001_users,
  },
  {
    name: 'Migration20260929225922_clients',
    class: Migration20260929225922_clients,
  },
  {
    name: 'Migration20261002160000_chats',
    class: Migration20261002160000_chats,
  },
];
