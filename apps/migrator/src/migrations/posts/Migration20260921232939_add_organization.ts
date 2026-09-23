import { Migration } from '@mikro-orm/migrations';

export class Migration20260921232939_add_organization extends Migration {
  override name = 'Migration20260921232939_add_organization';

  override up(): void | Promise<void> {
    this.addSql(
      `create table "posts"."organization" ("id" varchar(64) not null, "name" varchar(120) not null, "slug" varchar(120) not null, "logo" varchar(255) null, "metadata" text null, "created_at" timestamptz not null, primary key ("id"));`,
    );
    this.addSql(
      `alter table "posts"."organization" add constraint "organization_slug_unique" unique ("slug");`,
    );

    this.addSql(
      `create table "posts"."member" ("id" varchar(64) not null, "organization_id" varchar(64) not null, "user_id" varchar(64) not null, "role" varchar(64) not null, "created_at" timestamptz not null, primary key ("id"));`,
    );
    this.addSql(
      `create index "member_organization_id_user_id_index" on "posts"."member" ("organization_id", "user_id");`,
    );

    this.addSql(
      `create table "posts"."invitation" ("id" varchar(64) not null, "organization_id" varchar(64) not null, "email" varchar(320) not null, "role" varchar(64) null, "status" varchar(32) not null, "expires_at" timestamptz not null, "created_at" timestamptz not null, "inviter_id" varchar(64) not null, primary key ("id"));`,
    );
    this.addSql(
      `create index "invitation_email_index" on "posts"."invitation" ("email");`,
    );

    this.addSql(
      `alter table "posts"."auth_user" alter column "ban_reason" type text using ("ban_reason"::text);`,
    );
    this.addSql(
      `alter table "posts"."auth_user" alter column "email" type varchar(320) using ("email"::varchar(320));`,
    );
    this.addSql(
      `alter table "posts"."auth_user" alter column "email_verified" set default false;`,
    );
    this.addSql(
      `alter table "posts"."auth_user" alter column "name" type varchar(100) using ("name"::varchar(100));`,
    );

    this.addSql(
      `alter table "posts"."session" add "active_organization_id" varchar(255) null;`,
    );

    this.addSql(
      `alter table "posts"."member" add constraint "member_organization_id_foreign" foreign key ("organization_id") references "posts"."organization" ("id");`,
    );
    this.addSql(
      `alter table "posts"."member" add constraint "member_user_id_foreign" foreign key ("user_id") references "posts"."auth_user" ("id");`,
    );

    this.addSql(
      `alter table "posts"."invitation" add constraint "invitation_organization_id_foreign" foreign key ("organization_id") references "posts"."organization" ("id");`,
    );
    this.addSql(
      `alter table "posts"."invitation" add constraint "invitation_inviter_id_foreign" foreign key ("inviter_id") references "posts"."auth_user" ("id");`,
    );
  }

  override down(): void | Promise<void> {
    this.addSql(
      `alter table "posts"."member" drop constraint "member_organization_id_foreign";`,
    );
    this.addSql(
      `alter table "posts"."invitation" drop constraint "invitation_organization_id_foreign";`,
    );

    this.addSql(`drop table if exists "posts"."organization" cascade;`);
    this.addSql(`drop table if exists "posts"."member" cascade;`);
    this.addSql(`drop table if exists "posts"."invitation" cascade;`);

    this.addSql(
      `alter table "posts"."auth_user" alter column "name" type varchar(255) using ("name"::varchar(255));`,
    );
    this.addSql(
      `alter table "posts"."auth_user" alter column "email" type varchar(255) using ("email"::varchar(255));`,
    );
    this.addSql(
      `alter table "posts"."auth_user" alter column "email_verified" drop default;`,
    );
    this.addSql(
      `alter table "posts"."auth_user" alter column "ban_reason" type varchar(255) using ("ban_reason"::varchar(255));`,
    );

    this.addSql(
      `alter table "posts"."session" drop column "active_organization_id";`,
    );
  }
}
