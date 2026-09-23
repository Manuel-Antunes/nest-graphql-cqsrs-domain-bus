import { Migration } from '@mikro-orm/migrations';

export class Migration20260921214757_init extends Migration {
  override name = 'Migration20260921214757_init';

  override up(): void | Promise<void> {
    this.addSql(`create schema if not exists "tagging";`);
    this.addSql(
      `create table "tagging"."event_log" ("stream_id" varchar(255) not null, "sequence" int not null, "identifier" varchar(255) not null, "message_type" varchar(255) not null, "payload" text not null, "occurred_at" timestamptz not null, primary key ("stream_id", "sequence"));`,
    );
    this.addSql(
      `alter table "tagging"."event_log" add constraint "event_log_identifier_unique" unique ("identifier");`,
    );

    this.addSql(
      `create table "tagging"."tags" ("id" varchar(36) not null, "name" varchar(50) not null, "created_at" timestamptz not null, primary key ("id"));`,
    );
    this.addSql(
      `alter table "tagging"."tags" add constraint "tags_name_unique" unique ("name");`,
    );

    this.addSql(
      `create table "tagging"."transport_message_inbox" ("identifier" varchar(255) not null, "message_type" varchar(255) not null, "origin" varchar(255) null, "received_at" timestamptz not null, primary key ("identifier"));`,
    );

    this.addSql(
      `create table "tagging"."users" ("id" varchar(36) not null, "email" varchar(320) not null, "name" varchar(100) not null, "roles" text[] not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "version" int not null, "deleted_at" timestamptz null, primary key ("id"));`,
    );
    this.addSql(
      `create index "users_email_index" on "tagging"."users" ("email");`,
    );
    this.addSql(
      `create index "users_deleted_at_index" on "tagging"."users" ("deleted_at");`,
    );

    this.addSql(
      `create table "tagging"."authors" ("id" varchar(36) not null, primary key ("id"));`,
    );

    this.addSql(
      `create table "tagging"."posts" ("id" varchar(36) not null, "title" varchar(200) not null, "content" text not null, "author_id" varchar(36) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "version" int not null, "published_at" timestamptz null, "deleted_at" timestamptz null, primary key ("id"));`,
    );
    this.addSql(
      `create index "posts_created_at_id_index" on "tagging"."posts" ("created_at", "id");`,
    );
    this.addSql(
      `create index "posts_deleted_at_index" on "tagging"."posts" ("deleted_at");`,
    );

    this.addSql(
      `create table "tagging"."posts_tags" ("post_id" varchar(36) not null, "tag_id" varchar(36) not null, primary key ("post_id", "tag_id"));`,
    );

    this.addSql(
      `alter table "tagging"."authors" add constraint "authors_id_foreign" foreign key ("id") references "tagging"."users" ("id") on update cascade on delete cascade;`,
    );

    this.addSql(
      `alter table "tagging"."posts" add constraint "posts_author_id_foreign" foreign key ("author_id") references "tagging"."authors" ("id");`,
    );

    this.addSql(
      `alter table "tagging"."posts_tags" add constraint "posts_tags_post_id_foreign" foreign key ("post_id") references "tagging"."posts" ("id") on update cascade on delete cascade;`,
    );
    this.addSql(
      `alter table "tagging"."posts_tags" add constraint "posts_tags_tag_id_foreign" foreign key ("tag_id") references "tagging"."tags" ("id") on update cascade on delete cascade;`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(
      `alter table "tagging"."posts_tags" drop constraint "posts_tags_tag_id_foreign";`,
    );
    this.addSql(
      `alter table "tagging"."authors" drop constraint "authors_id_foreign";`,
    );
    this.addSql(
      `alter table "tagging"."posts" drop constraint "posts_author_id_foreign";`,
    );
    this.addSql(
      `alter table "tagging"."posts_tags" drop constraint "posts_tags_post_id_foreign";`,
    );

    this.addSql(`drop table if exists "tagging"."event_log" cascade;`);
    this.addSql(`drop table if exists "tagging"."tags" cascade;`);
    this.addSql(
      `drop table if exists "tagging"."transport_message_inbox" cascade;`,
    );
    this.addSql(`drop table if exists "tagging"."users" cascade;`);
    this.addSql(`drop table if exists "tagging"."authors" cascade;`);
    this.addSql(`drop table if exists "tagging"."posts" cascade;`);
    this.addSql(`drop table if exists "tagging"."posts_tags" cascade;`);

    this.addSql(`drop schema if exists "tagging";`);
  }
}
