import { Migration } from '@mikro-orm/migrations';

export class Migration20260922172513_unify_event_log extends Migration {

  override name = 'Migration20260922172513_unify_event_log';

  override up(): void | Promise<void> {
    this.addSql(`create table "posts"."event_log" ("position" bigserial primary key, "stream_id" varchar(255) null, "sequence" int null, "identifier" varchar(255) not null, "message_type" varchar(255) not null, "payload" text not null, "occurred_at" timestamptz not null);`);
    this.addSql(`alter table "posts"."event_log" add constraint "event_log_identifier_unique" unique ("identifier");`);
    this.addSql(`alter table "posts"."event_log" add constraint "event_log_stream_id_sequence_unique" unique ("stream_id", "sequence");`);

    this.addSql(`drop table if exists "posts"."transport_event_feed" cascade;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`create table "posts"."transport_event_feed" ("position" bigserial primary key, "identifier" varchar(255) not null, "message_type" varchar(255) not null, "payload" text not null, "appended_at" timestamptz(6) not null);`);
    this.addSql(`alter table "posts"."transport_event_feed" add constraint "transport_event_feed_identifier_unique" unique ("identifier");`);

    this.addSql(`drop table if exists "posts"."event_log" cascade;`);
  }

}
