import { Migration } from '@mikro-orm/migrations';

export class Migration20260926152128_team_references extends Migration {

  override name = 'Migration20260926152128_team_references';

  override up(): void | Promise<void> {
    this.addSql(`delete from "team" where "organization_id" not in (select "id" from "organization");`);
    this.addSql(`delete from "team_member" where "team_id" not in (select "id" from "team") or "user_id" not in (select "id" from "auth_user");`);

    this.addSql(`alter table "team" alter column "organization_id" type varchar(64) using ("organization_id"::varchar(64));`);
    this.addSql(`alter table "team" add constraint "team_organization_id_foreign" foreign key ("organization_id") references "organization" ("id") on delete cascade;`);
    this.addSql(`create index "team_organization_id_index" on "team" ("organization_id");`);

    this.addSql(`alter table "team_member" alter column "team_id" type varchar(64) using ("team_id"::varchar(64));`);
    this.addSql(`alter table "team_member" alter column "user_id" type varchar(64) using ("user_id"::varchar(64));`);
    this.addSql(`alter table "team_member" add constraint "team_member_team_id_foreign" foreign key ("team_id") references "team" ("id") on delete cascade;`);
    this.addSql(`alter table "team_member" add constraint "team_member_user_id_foreign" foreign key ("user_id") references "auth_user" ("id") on delete cascade;`);
    this.addSql(`create index "team_member_team_id_index" on "team_member" ("team_id");`);
    this.addSql(`create index "team_member_user_id_index" on "team_member" ("user_id");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "team" drop constraint "team_organization_id_foreign";`);

    this.addSql(`alter table "team_member" drop constraint "team_member_team_id_foreign";`);
    this.addSql(`alter table "team_member" drop constraint "team_member_user_id_foreign";`);

    this.addSql(`drop index "team_organization_id_index";`);
    this.addSql(`alter table "team" alter column "organization_id" type varchar(255) using ("organization_id"::varchar(255));`);

    this.addSql(`drop index "team_member_team_id_index";`);
    this.addSql(`drop index "team_member_user_id_index";`);
    this.addSql(`alter table "team_member" alter column "team_id" type varchar(255) using ("team_id"::varchar(255));`);
    this.addSql(`alter table "team_member" alter column "user_id" type varchar(255) using ("user_id"::varchar(255));`);
  }

}
