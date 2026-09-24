import { Migration } from '@mikro-orm/migrations';

export class Migration20260924024220_add_notifications extends Migration {

  override name = 'Migration20260924024220_add_notifications';

  override up(): void | Promise<void> {
    this.addSql(`create table "posts"."devices" ("id" varchar(36) not null, "token" varchar(4096) not null, "device_id" varchar(255) not null, "platform" varchar(255) not null, "meta" jsonb not null, "notifiable_type" varchar(255) not null, "notifiable_id" varchar(255) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table "posts"."devices" add constraint "devices_token_unique" unique ("token");`);
    this.addSql(`create index "devices_notifiable_type_notifiable_id_index" on "posts"."devices" ("notifiable_type", "notifiable_id");`);

    this.addSql(`create table "posts"."notification_deliveries" ("notification_id" varchar(36) not null, "channel" varchar(255) not null, "delivered_at" timestamptz not null, primary key ("notification_id", "channel"));`);

    this.addSql(`create table "posts"."notifications" ("id" varchar(36) not null, "type" varchar(255) not null, "notifiable_type" varchar(255) not null, "notifiable_id" varchar(255) not null, "data" jsonb not null, "read_at" timestamptz null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "notifications_notifiable_type_notifiable_id_created_at_index" on "posts"."notifications" ("notifiable_type", "notifiable_id", "created_at");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "posts"."devices" cascade;`);
    this.addSql(`drop table if exists "posts"."notification_deliveries" cascade;`);
    this.addSql(`drop table if exists "posts"."notifications" cascade;`);
  }

}
