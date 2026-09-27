import { Migration } from '@mikro-orm/migrations';

export class Migration20260927000701_outbox extends Migration {

  override name = 'Migration20260927000701_outbox';

  override up(): void | Promise<void> {
    this.addSql(`create table "transport"."outbox_dead_letters" ("id" text not null, "producer" text not null, "seq" bigint not null, "topic" text not null, "payload" jsonb null, "headers" jsonb not null, "key" text null, "created_at" timestamptz not null, "attempts" int not null, "last_error" text null, "history" jsonb not null, "reason" text not null, "failed_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "outbox_dead_letters_producer_failed_at" on "transport"."outbox_dead_letters" ("producer", "failed_at");`);

    this.addSql(`create table "transport"."outbox_inbox" ("consumer" text not null, "message_id" text not null, "processed_at" timestamptz not null, "message_type" text null, "origin" text null, primary key ("consumer", "message_id"));`);
    this.addSql(`create index "outbox_inbox_processed_at" on "transport"."outbox_inbox" ("processed_at");`);

    this.addSql(`create table "transport"."outbox_messages" ("seq" bigserial primary key, "id" text not null, "producer" text not null, "topic" text not null, "payload" jsonb null, "headers" jsonb not null, "key" text null, "created_at" timestamptz not null, "available_at" timestamptz not null, "attempts" int not null default 0, "last_error" text null, "history" jsonb not null default '[]', "lease_owner" text null, "lease_until" timestamptz null);`);
    this.addSql(`alter table "transport"."outbox_messages" add constraint "outbox_messages_id_unique" unique ("id");`);
    this.addSql(`create index "outbox_messages_producer_seq" on "transport"."outbox_messages" ("producer", "seq");`);
    this.addSql(`create index "outbox_messages_producer_key_seq" on "transport"."outbox_messages" ("producer", "key", "seq");`);

    this.addSql(`drop table if exists "transport"."transport_message_inbox" cascade;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`create table "transport"."transport_message_inbox" ("identifier" varchar(255) not null, "message_type" varchar(255) not null, "origin" varchar(255) null, "received_at" timestamptz(6) not null, primary key ("identifier"));`);

    this.addSql(`drop table if exists "transport"."outbox_dead_letters" cascade;`);
    this.addSql(`drop table if exists "transport"."outbox_inbox" cascade;`);
    this.addSql(`drop table if exists "transport"."outbox_messages" cascade;`);
  }

}
