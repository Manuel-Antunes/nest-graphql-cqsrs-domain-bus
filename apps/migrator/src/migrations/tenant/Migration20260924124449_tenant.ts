import { Migration } from '@mikro-orm/migrations';

export class Migration20260924124449_tenant extends Migration {

  private getConnectionSchema(): string {
    const em = this.getEntityManager();
    const schema = em.schema || this.config.get('schema');
    return em.getPlatform().quoteIdentifier(schema as string);
  }

  override name = 'Migration20260924124449_tenant';

  override up(): void | Promise<void> {
    const schema = this.getConnectionSchema();

    this.addSql(`create schema if not exists ${schema};`);
    this.addSql(`create table ${schema}."devices" ("id" varchar(36) not null, "token" varchar(4096) not null, "device_id" varchar(255) not null, "platform" varchar(255) not null, "meta" jsonb not null, "notifiable_type" varchar(255) not null, "notifiable_id" varchar(255) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table ${schema}."devices" add constraint "devices_token_unique" unique ("token");`);
    this.addSql(`create index "devices_notifiable_type_notifiable_id_index" on ${schema}."devices" ("notifiable_type", "notifiable_id");`);

    this.addSql(`create table ${schema}."notification_deliveries" ("notification_id" varchar(36) not null, "channel" varchar(255) not null, "delivered_at" timestamptz not null, primary key ("notification_id", "channel"));`);

    this.addSql(`create table ${schema}."notifications" ("id" varchar(36) not null, "type" varchar(255) not null, "notifiable_type" varchar(255) not null, "notifiable_id" varchar(255) not null, "data" jsonb not null, "read_at" timestamptz null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "notifications_notifiable_type_notifiable_id_created_at_index" on ${schema}."notifications" ("notifiable_type", "notifiable_id", "created_at");`);

    this.addSql(`create table ${schema}."tags" ("id" varchar(36) not null, "name" varchar(50) not null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table ${schema}."tags" add constraint "tags_name_unique" unique ("name");`);

    this.addSql(`create table ${schema}."users" ("id" varchar(36) not null, "email" varchar(320) not null, "name" varchar(100) not null, "roles" text[] not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "version" int not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "users_email_index" on ${schema}."users" ("email");`);
    this.addSql(`create index "users_deleted_at_index" on ${schema}."users" ("deleted_at");`);

    this.addSql(`create table ${schema}."authors" ("id" varchar(36) not null, primary key ("id"));`);

    this.addSql(`create table ${schema}."posts" ("id" varchar(36) not null, "title" varchar(200) not null, "content" text not null, "asset" json null, "author_id" varchar(36) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "version" int not null, "published_at" timestamptz null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "posts_created_at_id_index" on ${schema}."posts" ("created_at", "id");`);
    this.addSql(`create index "posts_deleted_at_index" on ${schema}."posts" ("deleted_at");`);

    this.addSql(`create table ${schema}."posts_tags" ("post_id" varchar(36) not null, "tag_id" varchar(36) not null, primary key ("post_id", "tag_id"));`);

    this.addSql(`alter table ${schema}."authors" add constraint "authors_id_foreign" foreign key ("id") references ${schema}."users" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table ${schema}."posts" add constraint "posts_author_id_foreign" foreign key ("author_id") references ${schema}."authors" ("id");`);

    this.addSql(`alter table ${schema}."posts_tags" add constraint "posts_tags_post_id_foreign" foreign key ("post_id") references ${schema}."posts" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table ${schema}."posts_tags" add constraint "posts_tags_tag_id_foreign" foreign key ("tag_id") references ${schema}."tags" ("id") on update cascade on delete cascade;`);
  }

  override down(): void | Promise<void> {
    const schema = this.getConnectionSchema();
    this.addSql(`alter table ${schema}."posts_tags" drop constraint "posts_tags_tag_id_foreign";`);
    this.addSql(`alter table ${schema}."authors" drop constraint "authors_id_foreign";`);
    this.addSql(`alter table ${schema}."posts" drop constraint "posts_author_id_foreign";`);
    this.addSql(`alter table ${schema}."posts_tags" drop constraint "posts_tags_post_id_foreign";`);

    this.addSql(`drop table if exists ${schema}."devices" cascade;`);
    this.addSql(`drop table if exists ${schema}."notification_deliveries" cascade;`);
    this.addSql(`drop table if exists ${schema}."notifications" cascade;`);
    this.addSql(`drop table if exists ${schema}."tags" cascade;`);
    this.addSql(`drop table if exists ${schema}."users" cascade;`);
    this.addSql(`drop table if exists ${schema}."authors" cascade;`);
    this.addSql(`drop table if exists ${schema}."posts" cascade;`);
    this.addSql(`drop table if exists ${schema}."posts_tags" cascade;`);

    this.addSql(`drop schema if exists ${schema};`);
  }

}
