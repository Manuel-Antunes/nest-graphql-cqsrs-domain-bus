import { Migration20260921214757_init } from './Migration20260921214757_init';
import { Migration20260922172518_unify_event_log } from './Migration20260922172518_unify_event_log';
import { Migration20260923200001_add_post_asset } from './Migration20260923200001_add_post_asset';

export const taggingMigrations = [
  { name: 'Migration20260921214757_init', class: Migration20260921214757_init },
  {
    name: 'Migration20260922172518_unify_event_log',
    class: Migration20260922172518_unify_event_log,
  },
  {
    name: 'Migration20260923200001_add_post_asset',
    class: Migration20260923200001_add_post_asset,
  },
];
