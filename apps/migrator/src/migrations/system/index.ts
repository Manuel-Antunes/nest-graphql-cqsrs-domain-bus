import type { MigrationObject } from '@mikro-orm/core';

import { Migration20260924124434_system } from './Migration20260924124434_system';
import { Migration20260924151026_event_log_trace_context } from './Migration20260924151026_event_log_trace_context';
import { Migration20260926152128_team_references } from './Migration20260926152128_team_references';
import { Migration20260927000701_outbox } from './Migration20260927000701_outbox';
import { Migration20260928120000_event_store_tags } from './Migration20260928120000_event_store_tags';
import { Migration20260928130000_users } from './Migration20260928130000_users';
import { Migration20260928140000_user_avatar } from './Migration20260928140000_user_avatar';
import { Migration20260929223847_chatwoot_sync } from './Migration20260929223847_chatwoot_sync';

export const systemMigrations: MigrationObject[] = [
  {
    name: 'Migration20260924124434_system',
    class: Migration20260924124434_system,
  },
  {
    name: 'Migration20260924151026_event_log_trace_context',
    class: Migration20260924151026_event_log_trace_context,
  },
  {
    name: 'Migration20260926152128_team_references',
    class: Migration20260926152128_team_references,
  },
  {
    name: 'Migration20260927000701_outbox',
    class: Migration20260927000701_outbox,
  },
  {
    name: 'Migration20260928120000_event_store_tags',
    class: Migration20260928120000_event_store_tags,
  },
  {
    name: 'Migration20260928130000_users',
    class: Migration20260928130000_users,
  },
  {
    name: 'Migration20260928140000_user_avatar',
    class: Migration20260928140000_user_avatar,
  },
  {
    name: 'Migration20260929223847_chatwoot_sync',
    class: Migration20260929223847_chatwoot_sync,
  },
];
