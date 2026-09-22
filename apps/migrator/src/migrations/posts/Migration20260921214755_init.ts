import { Migration } from '@mikro-orm/migrations';

export class Migration20260921214755_init extends Migration {

  override name = 'Migration20260921214755_init';

  override up(): void | Promise<void> {
    this.addSql(`create schema if not exists "posts";`);
    this.addSql(`create table "posts"."account" ("id" varchar(64) not null, "account_id" varchar(255) not null, "provider_id" varchar(255) not null, "user_id" varchar(255) not null, "access_token" text null, "refresh_token" text null, "id_token" text null, "access_token_expires_at" timestamptz null, "refresh_token_expires_at" timestamptz null, "scope" varchar(255) null, "password" varchar(255) null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);

    this.addSql(`create table "posts"."auth_user" ("id" varchar(64) not null, "name" varchar(255) not null, "email" varchar(255) not null, "email_verified" boolean not null, "image" varchar(255) null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "role" varchar(255) null, "banned" boolean null, "ban_reason" varchar(255) null, "ban_expires" timestamptz null, primary key ("id"));`);
    this.addSql(`alter table "posts"."auth_user" add constraint "auth_user_email_unique" unique ("email");`);

    this.addSql(`create table "posts"."jwks" ("id" varchar(64) not null, "public_key" text not null, "private_key" text not null, "created_at" timestamptz not null, "expires_at" timestamptz null, "alg" varchar(255) null, "crv" varchar(255) null, primary key ("id"));`);

    this.addSql(`create table "posts"."oauth_access_token" ("id" varchar(64) not null, "token" text not null, "client_id" varchar(255) not null, "session_id" varchar(255) null, "user_id" varchar(255) null, "reference_id" varchar(255) null, "authorization_code_id" varchar(255) null, "resources" text[] null, "requested_user_info_claims" text[] null, "refresh_id" varchar(255) null, "expires_at" timestamptz not null, "created_at" timestamptz not null, "revoked" timestamptz null, "confirmation" jsonb null, "scopes" text[] not null, primary key ("id"));`);
    this.addSql(`alter table "posts"."oauth_access_token" add constraint "oauth_access_token_token_unique" unique ("token");`);

    this.addSql(`create table "posts"."oauth_client" ("id" varchar(64) not null, "client_id" varchar(255) not null, "client_secret" text null, "client_discovery_id" varchar(255) null, "disabled" boolean null, "skip_consent" boolean null, "enable_end_session" boolean null, "subject_type" varchar(255) null, "scopes" text[] null, "client_credentials_scopes" text[] null, "user_id" varchar(255) null, "created_at" timestamptz null, "updated_at" timestamptz null, "name" varchar(255) null, "uri" text null, "icon" varchar(255) null, "contacts" text[] null, "tos" varchar(255) null, "policy" varchar(255) null, "software_id" varchar(255) null, "software_version" varchar(255) null, "software_statement" text null, "redirect_uris" text[] not null, "post_logout_redirect_uris" text[] null, "backchannel_logout_uri" text null, "backchannel_logout_session_required" boolean null, "token_endpoint_auth_method" text null, "application_type" varchar(255) null, "jwks" text null, "jwks_uri" text null, "grant_types" text[] null, "response_types" text[] null, "require_pkce" boolean null, "dpop_bound_access_tokens" boolean null, "reference_id" varchar(255) null, "metadata" jsonb null, primary key ("id"));`);
    this.addSql(`alter table "posts"."oauth_client" add constraint "oauth_client_client_id_unique" unique ("client_id");`);

    this.addSql(`create table "posts"."oauth_client_assertion" ("id" varchar(64) not null, "expires_at" timestamptz not null, primary key ("id"));`);

    this.addSql(`create table "posts"."oauth_client_resource" ("id" varchar(64) not null, "client_id" varchar(255) not null, "resource_id" varchar(255) not null, "metadata" jsonb null, "created_at" timestamptz null, primary key ("id"));`);

    this.addSql(`create table "posts"."oauth_consent" ("id" varchar(64) not null, "client_id" varchar(255) not null, "user_id" varchar(255) null, "reference_id" varchar(255) null, "resources" text[] null, "requested_user_info_claims" text[] null, "scopes" text[] not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);

    this.addSql(`create table "posts"."oauth_refresh_token" ("id" varchar(64) not null, "token" text not null, "client_id" varchar(255) not null, "session_id" varchar(255) null, "user_id" varchar(255) not null, "reference_id" varchar(255) null, "authorization_code_id" varchar(255) null, "resources" text[] null, "requested_user_info_claims" text[] null, "expires_at" timestamptz not null, "created_at" timestamptz not null, "revoked" timestamptz null, "rotated_at" timestamptz null, "rotation_replay_response" varchar(255) null, "rotation_replay_expires_at" timestamptz null, "auth_time" timestamptz null, "confirmation" jsonb null, "scopes" text[] not null, primary key ("id"));`);
    this.addSql(`alter table "posts"."oauth_refresh_token" add constraint "oauth_refresh_token_token_unique" unique ("token");`);

    this.addSql(`create table "posts"."oauth_resource" ("id" varchar(64) not null, "identifier" varchar(255) not null, "name" varchar(255) not null, "access_token_ttl" int null, "refresh_token_ttl" int null, "signing_algorithm" varchar(255) null, "signing_key_id" text null, "allowed_scopes" text[] null, "custom_claims" jsonb null, "dpop_bound_access_tokens_required" boolean null, "disabled" boolean null, "created_at" timestamptz null, "updated_at" timestamptz null, "policy_version" int null, "metadata" jsonb null, primary key ("id"));`);
    this.addSql(`alter table "posts"."oauth_resource" add constraint "oauth_resource_identifier_unique" unique ("identifier");`);

    this.addSql(`create table "posts"."session" ("id" varchar(64) not null, "expires_at" timestamptz not null, "token" text not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "ip_address" varchar(255) null, "user_agent" varchar(255) null, "user_id" varchar(255) not null, "impersonated_by" varchar(255) null, primary key ("id"));`);
    this.addSql(`alter table "posts"."session" add constraint "session_token_unique" unique ("token");`);

    this.addSql(`create table "posts"."tags" ("id" varchar(36) not null, "name" varchar(50) not null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table "posts"."tags" add constraint "tags_name_unique" unique ("name");`);

    this.addSql(`create table "posts"."transport_message_inbox" ("identifier" varchar(255) not null, "message_type" varchar(255) not null, "origin" varchar(255) null, "received_at" timestamptz not null, primary key ("identifier"));`);

    this.addSql(`create table "posts"."users" ("id" varchar(36) not null, "email" varchar(320) not null, "name" varchar(100) not null, "roles" text[] not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "version" int not null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "users_email_index" on "posts"."users" ("email");`);
    this.addSql(`create index "users_deleted_at_index" on "posts"."users" ("deleted_at");`);

    this.addSql(`create table "posts"."authors" ("id" varchar(36) not null, primary key ("id"));`);

    this.addSql(`create table "posts"."posts" ("id" varchar(36) not null, "title" varchar(200) not null, "content" text not null, "author_id" varchar(36) not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "version" int not null, "published_at" timestamptz null, "deleted_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "posts_created_at_id_index" on "posts"."posts" ("created_at", "id");`);
    this.addSql(`create index "posts_deleted_at_index" on "posts"."posts" ("deleted_at");`);

    this.addSql(`create table "posts"."posts_tags" ("post_id" varchar(36) not null, "tag_id" varchar(36) not null, primary key ("post_id", "tag_id"));`);

    this.addSql(`create table "posts"."verification" ("id" varchar(64) not null, "identifier" varchar(255) not null, "value" text not null, "expires_at" timestamptz not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);

    this.addSql(`alter table "posts"."authors" add constraint "authors_id_foreign" foreign key ("id") references "posts"."users" ("id") on update cascade on delete cascade;`);

    this.addSql(`alter table "posts"."posts" add constraint "posts_author_id_foreign" foreign key ("author_id") references "posts"."authors" ("id");`);

    this.addSql(`alter table "posts"."posts_tags" add constraint "posts_tags_post_id_foreign" foreign key ("post_id") references "posts"."posts" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table "posts"."posts_tags" add constraint "posts_tags_tag_id_foreign" foreign key ("tag_id") references "posts"."tags" ("id") on update cascade on delete cascade;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "posts"."posts_tags" drop constraint "posts_tags_tag_id_foreign";`);
    this.addSql(`alter table "posts"."authors" drop constraint "authors_id_foreign";`);
    this.addSql(`alter table "posts"."posts" drop constraint "posts_author_id_foreign";`);
    this.addSql(`alter table "posts"."posts_tags" drop constraint "posts_tags_post_id_foreign";`);

    this.addSql(`drop table if exists "posts"."account" cascade;`);
    this.addSql(`drop table if exists "posts"."auth_user" cascade;`);
    this.addSql(`drop table if exists "posts"."jwks" cascade;`);
    this.addSql(`drop table if exists "posts"."oauth_access_token" cascade;`);
    this.addSql(`drop table if exists "posts"."oauth_client" cascade;`);
    this.addSql(`drop table if exists "posts"."oauth_client_assertion" cascade;`);
    this.addSql(`drop table if exists "posts"."oauth_client_resource" cascade;`);
    this.addSql(`drop table if exists "posts"."oauth_consent" cascade;`);
    this.addSql(`drop table if exists "posts"."oauth_refresh_token" cascade;`);
    this.addSql(`drop table if exists "posts"."oauth_resource" cascade;`);
    this.addSql(`drop table if exists "posts"."session" cascade;`);
    this.addSql(`drop table if exists "posts"."tags" cascade;`);
    this.addSql(`drop table if exists "posts"."transport_message_inbox" cascade;`);
    this.addSql(`drop table if exists "posts"."users" cascade;`);
    this.addSql(`drop table if exists "posts"."authors" cascade;`);
    this.addSql(`drop table if exists "posts"."posts" cascade;`);
    this.addSql(`drop table if exists "posts"."posts_tags" cascade;`);
    this.addSql(`drop table if exists "posts"."verification" cascade;`);

    this.addSql(`drop schema if exists "posts";`);
  }

}
