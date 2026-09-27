import type { MigrationObject } from '@mikro-orm/core';

import { Migration20260924124434_system } from './Migration20260924124434_system';
import { Migration20260924151026_event_log_trace_context } from './Migration20260924151026_event_log_trace_context';
import { Migration20260926152128_team_references } from './Migration20260926152128_team_references';
import { Migration20260927000701_outbox } from './Migration20260927000701_outbox';

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
];
