import { Migration } from '@mikro-orm/migrations';

export class Migration20260928130000_users extends Migration {

  override name = 'Migration20260928130000_users';

  override up(): void | Promise<void> {
    this.addSql(`alter table "auth_user" rename to "users";`);
    this.addSql(`alter table "users" rename constraint "auth_user_pkey" to "users_pkey";`);
    this.addSql(`alter table "users" drop constraint "auth_user_email_unique";`);
    this.addSql(`alter table "users" add "version" int not null default 1, add "deleted_at" timestamptz null, add "kind" varchar(255) not null default 'user';`);
    this.addSql(`alter table "users" alter column "email_verified" drop not null;`);
    this.addSql(`update "users" set "name" = left(split_part("email", '@', 1), 100) where btrim("name") = '';`);
    this.addSql(`create index "users_kind_index" on "users" ("kind");`);
    this.addSql(`create index "users_deleted_at_index" on "users" ("deleted_at");`);
    this.addSql(`create unique index "users_email_unique" on "users" ("email") where "deleted_at" is null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`delete from "users" where "deleted_at" is not null;`);
    this.addSql(`drop index if exists "users_email_unique";`);
    this.addSql(`drop index if exists "users_deleted_at_index";`);
    this.addSql(`drop index if exists "users_kind_index";`);
    this.addSql(`update "users" set "email_verified" = false where "email_verified" is null;`);
    this.addSql(`alter table "users" alter column "email_verified" set not null;`);
    this.addSql(`alter table "users" drop column "version", drop column "kind", drop column "deleted_at";`);
    this.addSql(`alter table "users" add constraint "auth_user_email_unique" unique ("email");`);
    this.addSql(`alter table "users" rename constraint "users_pkey" to "auth_user_pkey";`);
    this.addSql(`alter table "users" rename to "auth_user";`);
  }

}
