import { Migration } from '@mikro-orm/migrations';

export class Migration20260922040710_add_event_feed extends Migration {
  override name = 'Migration20260922040710_add_event_feed';

  override up(): void | Promise<void> {
    this.addSql(
      `create table "posts"."transport_event_feed" ("position" bigserial primary key, "identifier" varchar(255) not null, "message_type" varchar(255) not null, "payload" text not null, "appended_at" timestamptz not null);`,
    );
    this.addSql(
      `alter table "posts"."transport_event_feed" add constraint "transport_event_feed_identifier_unique" unique ("identifier");`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "posts"."transport_event_feed" cascade;`);
  }
}
