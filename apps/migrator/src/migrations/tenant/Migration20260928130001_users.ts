import { Migration } from '@mikro-orm/migrations';

export class Migration20260928130001_users extends Migration {

  private getConnectionSchema(): string {
    const em = this.getEntityManager();
    const schema = em.schema || this.config.get('schema');
    return em.getPlatform().quoteIdentifier(schema as string);
  }

  override name = 'Migration20260928130001_users';

  override up(): void | Promise<void> {
    const schema = this.getConnectionSchema();

    this.addSql(`alter table ${schema}."calendar_events" drop constraint "calendar_events_responsible_id_foreign";`);
    this.addSql(`alter table ${schema}."calendar_events_participants" drop constraint "calendar_events_participants_user_id_foreign";`);
    this.addSql(`alter table ${schema}."authors" drop constraint "authors_id_foreign";`);
    this.addSql(`alter table ${schema}."posts" drop constraint "posts_author_id_foreign";`);

    this.addSql(`alter table ${schema}."calendar_events" alter column "responsible_id" type varchar(64) using ("responsible_id"::varchar(64));`);
    this.addSql(`alter table ${schema}."calendar_events_participants" alter column "user_id" type varchar(64) using ("user_id"::varchar(64));`);
    this.addSql(`alter table ${schema}."authors" alter column "id" type varchar(64) using ("id"::varchar(64));`);
    this.addSql(`alter table ${schema}."posts" alter column "author_id" type varchar(64) using ("author_id"::varchar(64));`);

    this.addSql(`insert into "public"."users" ("id", "email", "name", "role", "created_at", "updated_at", "version", "deleted_at") select distinct on ("tu"."email") "tu"."id", "tu"."email", "tu"."name", nullif(array_to_string("tu"."roles", ','), ''), "tu"."created_at", "tu"."updated_at", "tu"."version", coalesce("tu"."deleted_at", now()) from ${schema}."users" as "tu" where not exists (select 1 from "public"."users" as "pu" where "pu"."email" = "tu"."email") order by "tu"."email", "tu"."created_at" on conflict ("id") do nothing;`);
    this.addSql(`alter table ${schema}."users" add "user_id" varchar(64) null;`);
    this.addSql(`update ${schema}."users" as "tu" set "user_id" = (select "pu"."id" from "public"."users" as "pu" where "pu"."email" = "tu"."email" order by "pu"."deleted_at" is null desc, "pu"."created_at" asc limit 1);`);

    this.addSql(`delete from ${schema}."authors" as "a" using ${schema}."users" as "tu" where "a"."id" = "tu"."id" and exists (select 1 from ${schema}."authors" as "o" join ${schema}."users" as "ou" on "ou"."id" = "o"."id" where "ou"."user_id" = "tu"."user_id" and "o"."id" < "a"."id");`);
    this.addSql(`delete from ${schema}."calendar_events_participants" as "p" using ${schema}."users" as "tu" where "p"."user_id" = "tu"."id" and exists (select 1 from ${schema}."calendar_events_participants" as "o" join ${schema}."users" as "ou" on "ou"."id" = "o"."user_id" where "o"."calendar_event_id" = "p"."calendar_event_id" and "ou"."user_id" = "tu"."user_id" and "o"."user_id" < "p"."user_id");`);

    this.addSql(`update ${schema}."authors" as "a" set "id" = "tu"."user_id" from ${schema}."users" as "tu" where "a"."id" = "tu"."id";`);
    this.addSql(`update ${schema}."posts" as "p" set "author_id" = "tu"."user_id" from ${schema}."users" as "tu" where "p"."author_id" = "tu"."id";`);
    this.addSql(`update ${schema}."calendar_events" as "e" set "responsible_id" = "tu"."user_id" from ${schema}."users" as "tu" where "e"."responsible_id" = "tu"."id";`);
    this.addSql(`update ${schema}."calendar_events_participants" as "p" set "user_id" = "tu"."user_id" from ${schema}."users" as "tu" where "p"."user_id" = "tu"."id";`);
    this.addSql(`update ${schema}."notifications" as "n" set "notifiable_id" = "tu"."user_id" from ${schema}."users" as "tu" where "n"."notifiable_type" = 'users.User' and "n"."notifiable_id" = "tu"."id";`);
    this.addSql(`update ${schema}."devices" as "d" set "notifiable_id" = "tu"."user_id" from ${schema}."users" as "tu" where "d"."notifiable_type" = 'users.User' and "d"."notifiable_id" = "tu"."id";`);

    this.addSql(`drop table ${schema}."users" cascade;`);

    this.addSql(`alter table ${schema}."authors" add constraint "authors_id_foreign" foreign key ("id") references "public"."users" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table ${schema}."posts" add constraint "posts_author_id_foreign" foreign key ("author_id") references ${schema}."authors" ("id");`);
    this.addSql(`alter table ${schema}."calendar_events" add constraint "calendar_events_responsible_id_foreign" foreign key ("responsible_id") references "public"."users" ("id");`);
    this.addSql(`alter table ${schema}."calendar_events_participants" add constraint "calendar_events_participants_user_id_foreign" foreign key ("user_id") references "public"."users" ("id") on update cascade on delete cascade;`);
  }

  override down(): void | Promise<void> {
    const schema = this.getConnectionSchema();

    this.addSql(`alter table ${schema}."authors" drop constraint "authors_id_foreign";`);
    this.addSql(`alter table ${schema}."posts" drop constraint "posts_author_id_foreign";`);
    this.addSql(`alter table ${schema}."calendar_events" drop constraint "calendar_events_responsible_id_foreign";`);
    this.addSql(`alter table ${schema}."calendar_events_participants" drop constraint "calendar_events_participants_user_id_foreign";`);

    this.addSql(`create table ${schema}."users" ("id" varchar(36) not null, "email" varchar(320) not null, "name" varchar(100) not null, "roles" text[] not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "version" int not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`insert into ${schema}."users" ("id", "email", "name", "roles", "created_at", "updated_at", "version", "deleted_at") select "pu"."id", "pu"."email", "pu"."name", coalesce(string_to_array("pu"."role", ','), '{}'), "pu"."created_at", "pu"."updated_at", "pu"."version", "pu"."deleted_at" from "public"."users" as "pu" where "pu"."id" in (select "id" from ${schema}."authors" union select "responsible_id" from ${schema}."calendar_events" union select "user_id" from ${schema}."calendar_events_participants");`);
    this.addSql(`create index "users_email_index" on ${schema}."users" ("email");`);
    this.addSql(`create index "users_deleted_at_index" on ${schema}."users" ("deleted_at");`);

    this.addSql(`alter table ${schema}."calendar_events" alter column "responsible_id" type varchar(36) using ("responsible_id"::varchar(36));`);
    this.addSql(`alter table ${schema}."calendar_events_participants" alter column "user_id" type varchar(36) using ("user_id"::varchar(36));`);
    this.addSql(`alter table ${schema}."authors" alter column "id" type varchar(36) using ("id"::varchar(36));`);
    this.addSql(`alter table ${schema}."posts" alter column "author_id" type varchar(36) using ("author_id"::varchar(36));`);

    this.addSql(`alter table ${schema}."authors" add constraint "authors_id_foreign" foreign key ("id") references ${schema}."users" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table ${schema}."posts" add constraint "posts_author_id_foreign" foreign key ("author_id") references ${schema}."authors" ("id");`);
    this.addSql(`alter table ${schema}."calendar_events" add constraint "calendar_events_responsible_id_foreign" foreign key ("responsible_id") references ${schema}."users" ("id");`);
    this.addSql(`alter table ${schema}."calendar_events_participants" add constraint "calendar_events_participants_user_id_foreign" foreign key ("user_id") references ${schema}."users" ("id") on update cascade on delete cascade;`);
  }

}
