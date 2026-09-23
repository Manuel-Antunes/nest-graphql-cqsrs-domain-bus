import { Migration20260921214757_init } from './Migration20260921214757_init';
import { Migration20260922172518_unify_event_log } from './Migration20260922172518_unify_event_log';

export const taggingMigrations = [
  { name: 'Migration20260921214757_init', class: Migration20260921214757_init },
  {
    name: 'Migration20260922172518_unify_event_log',
    class: Migration20260922172518_unify_event_log,
  },
];
