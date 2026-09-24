import { Migration20260921214755_init } from './Migration20260921214755_init';
import { Migration20260921232939_add_organization } from './Migration20260921232939_add_organization';
import { Migration20260921235341_organization_tenant_schema } from './Migration20260921235341_organization_tenant_schema';
import { Migration20260922040710_add_event_feed } from './Migration20260922040710_add_event_feed';
import { Migration20260922172513_unify_event_log } from './Migration20260922172513_unify_event_log';
import { Migration20260923200000_add_post_asset } from './Migration20260923200000_add_post_asset';

export const postsMigrations = [
  { name: 'Migration20260921214755_init', class: Migration20260921214755_init },
  {
    name: 'Migration20260921232939_add_organization',
    class: Migration20260921232939_add_organization,
  },
  {
    name: 'Migration20260921235341_organization_tenant_schema',
    class: Migration20260921235341_organization_tenant_schema,
  },
  {
    name: 'Migration20260922040710_add_event_feed',
    class: Migration20260922040710_add_event_feed,
  },
  {
    name: 'Migration20260922172513_unify_event_log',
    class: Migration20260922172513_unify_event_log,
  },
  {
    name: 'Migration20260923200000_add_post_asset',
    class: Migration20260923200000_add_post_asset,
  },
];
