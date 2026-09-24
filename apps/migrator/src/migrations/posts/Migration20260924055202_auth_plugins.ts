import { Migration } from '@mikro-orm/migrations';

export class Migration20260924055202_auth_plugins extends Migration {

  override name = 'Migration20260924055202_auth_plugins';

  override up(): void | Promise<void> {
    this.addSql(`create table "posts"."team" ("id" varchar(64) not null, "name" varchar(255) not null, "member_count" int not null, "organization_id" varchar(255) not null, "created_at" timestamptz not null, "updated_at" timestamptz null, primary key ("id"));`);

    this.addSql(`create table "posts"."team_member" ("id" varchar(64) not null, "team_id" varchar(255) not null, "user_id" varchar(255) not null, "membership_key" text null, "created_at" timestamptz null, primary key ("id"));`);
    this.addSql(`alter table "posts"."team_member" add constraint "team_member_membership_key_unique" unique ("membership_key");`);

    this.addSql(`create table "posts"."two_factor" ("id" varchar(64) not null, "secret" text not null, "backup_codes" text not null, "user_id" varchar(255) not null, "verified" boolean null, "failed_verification_count" int null, "locked_until" timestamptz null, primary key ("id"));`);

    this.addSql(`alter table "posts"."auth_user" add "two_factor_enabled" boolean null default false;`);

    this.addSql(`alter table "posts"."oauth_access_token" alter column "resources" type text using (array_to_json("resources")::text);`);
    this.addSql(`alter table "posts"."oauth_access_token" alter column "requested_user_info_claims" type text using (array_to_json("requested_user_info_claims")::text);`);
    this.addSql(`alter table "posts"."oauth_access_token" alter column "scopes" type text using (array_to_json("scopes")::text);`);

    this.addSql(`alter table "posts"."oauth_client" alter column "scopes" type text using (array_to_json("scopes")::text);`);
    this.addSql(`alter table "posts"."oauth_client" alter column "client_credentials_scopes" type text using (array_to_json("client_credentials_scopes")::text);`);
    this.addSql(`alter table "posts"."oauth_client" alter column "contacts" type text using (array_to_json("contacts")::text);`);
    this.addSql(`alter table "posts"."oauth_client" alter column "redirect_uris" type text using (array_to_json("redirect_uris")::text);`);
    this.addSql(`alter table "posts"."oauth_client" alter column "post_logout_redirect_uris" type text using (array_to_json("post_logout_redirect_uris")::text);`);
    this.addSql(`alter table "posts"."oauth_client" alter column "grant_types" type text using (array_to_json("grant_types")::text);`);
    this.addSql(`alter table "posts"."oauth_client" alter column "response_types" type text using (array_to_json("response_types")::text);`);

    this.addSql(`alter table "posts"."oauth_consent" alter column "resources" type text using (array_to_json("resources")::text);`);
    this.addSql(`alter table "posts"."oauth_consent" alter column "requested_user_info_claims" type text using (array_to_json("requested_user_info_claims")::text);`);
    this.addSql(`alter table "posts"."oauth_consent" alter column "scopes" type text using (array_to_json("scopes")::text);`);

    this.addSql(`alter table "posts"."oauth_refresh_token" alter column "resources" type text using (array_to_json("resources")::text);`);
    this.addSql(`alter table "posts"."oauth_refresh_token" alter column "requested_user_info_claims" type text using (array_to_json("requested_user_info_claims")::text);`);
    this.addSql(`alter table "posts"."oauth_refresh_token" alter column "scopes" type text using (array_to_json("scopes")::text);`);

    this.addSql(`alter table "posts"."oauth_resource" alter column "allowed_scopes" type text using (array_to_json("allowed_scopes")::text);`);

    this.addSql(`alter table "posts"."invitation" add "team_id" varchar(64) null;`);

    this.addSql(`alter table "posts"."session" add "active_team_id" varchar(255) null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "posts"."team" cascade;`);
    this.addSql(`drop table if exists "posts"."team_member" cascade;`);
    this.addSql(`drop table if exists "posts"."two_factor" cascade;`);

    this.addSql(`alter table "posts"."auth_user" drop column "two_factor_enabled";`);

    this.addSql(`alter table "posts"."invitation" drop column "team_id";`);

    this.addSql(`alter table "posts"."oauth_access_token" alter column "resources" type text[] using (translate(\"resources\", '[]', '{}')::text[]);`);
    this.addSql(`alter table "posts"."oauth_access_token" alter column "requested_user_info_claims" type text[] using (translate(\"requested_user_info_claims\", '[]', '{}')::text[]);`);
    this.addSql(`alter table "posts"."oauth_access_token" alter column "scopes" type text[] using (translate(\"scopes\", '[]', '{}')::text[]);`);

    this.addSql(`alter table "posts"."oauth_client" alter column "scopes" type text[] using (translate(\"scopes\", '[]', '{}')::text[]);`);
    this.addSql(`alter table "posts"."oauth_client" alter column "client_credentials_scopes" type text[] using (translate(\"client_credentials_scopes\", '[]', '{}')::text[]);`);
    this.addSql(`alter table "posts"."oauth_client" alter column "contacts" type text[] using (translate(\"contacts\", '[]', '{}')::text[]);`);
    this.addSql(`alter table "posts"."oauth_client" alter column "redirect_uris" type text[] using (translate(\"redirect_uris\", '[]', '{}')::text[]);`);
    this.addSql(`alter table "posts"."oauth_client" alter column "post_logout_redirect_uris" type text[] using (translate(\"post_logout_redirect_uris\", '[]', '{}')::text[]);`);
    this.addSql(`alter table "posts"."oauth_client" alter column "grant_types" type text[] using (translate(\"grant_types\", '[]', '{}')::text[]);`);
    this.addSql(`alter table "posts"."oauth_client" alter column "response_types" type text[] using (translate(\"response_types\", '[]', '{}')::text[]);`);

    this.addSql(`alter table "posts"."oauth_consent" alter column "resources" type text[] using (translate(\"resources\", '[]', '{}')::text[]);`);
    this.addSql(`alter table "posts"."oauth_consent" alter column "requested_user_info_claims" type text[] using (translate(\"requested_user_info_claims\", '[]', '{}')::text[]);`);
    this.addSql(`alter table "posts"."oauth_consent" alter column "scopes" type text[] using (translate(\"scopes\", '[]', '{}')::text[]);`);

    this.addSql(`alter table "posts"."oauth_refresh_token" alter column "resources" type text[] using (translate(\"resources\", '[]', '{}')::text[]);`);
    this.addSql(`alter table "posts"."oauth_refresh_token" alter column "requested_user_info_claims" type text[] using (translate(\"requested_user_info_claims\", '[]', '{}')::text[]);`);
    this.addSql(`alter table "posts"."oauth_refresh_token" alter column "scopes" type text[] using (translate(\"scopes\", '[]', '{}')::text[]);`);

    this.addSql(`alter table "posts"."oauth_resource" alter column "allowed_scopes" type text[] using (translate(\"allowed_scopes\", '[]', '{}')::text[]);`);

    this.addSql(`alter table "posts"."session" drop column "active_team_id";`);
  }

}
