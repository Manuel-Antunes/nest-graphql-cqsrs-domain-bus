import type { MigrationObject } from '@mikro-orm/core';

import { Migration20260924124434_system } from './Migration20260924124434_system';
import { Migration20260924151026_event_log_trace_context } from './Migration20260924151026_event_log_trace_context';

export const systemMigrations: MigrationObject[] = [
  {
    name: 'Migration20260924124434_system',
    class: Migration20260924124434_system,
  },
  {
    name: 'Migration20260924151026_event_log_trace_context',
    class: Migration20260924151026_event_log_trace_context,
  },
];
