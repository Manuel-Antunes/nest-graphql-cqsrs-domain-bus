import { Migration } from '@mikro-orm/migrations';

export class Migration20260924124434_system extends Migration {

  override name = 'Migration20260924124434_system';

  override up(): void | Promise<void> {
    this.addSql(`create schema if not exists "transport";`);
    this.addSql(`create table "account" ("id" varchar(64) not null, "account_id" varchar(255) not null, "provider_id" varchar(255) not null, "user_id" varchar(255) not null, "access_token" text null, "refresh_token" text null, "id_token" text null, "access_token_expires_at" timestamptz null, "refresh_token_expires_at" timestamptz null, "scope" varchar(255) null, "password" varchar(255) null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);

    this.addSql(`create table "auth_user" ("id" varchar(64) not null, "name" varchar(100) not null, "email" varchar(320) not null, "email_verified" boolean not null default false, "image" varchar(255) null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "role" varchar(255) null, "banned" boolean null, "ban_reason" text null, "ban_expires" timestamptz null, "two_factor_enabled" boolean null default false, primary key ("id"));`);
    this.addSql(`alter table "auth_user" add constraint "auth_user_email_unique" unique ("email");`);

    this.addSql(`create table "jwks" ("id" varchar(64) not null, "public_key" text not null, "private_key" text not null, "created_at" timestamptz not null, "expires_at" timestamptz null, "alg" varchar(255) null, "crv" varchar(255) null, primary key ("id"));`);

    this.addSql(`create table "transport"."event_log" ("position" bigserial primary key, "stream_id" varchar(255) null, "sequence" int null, "identifier" varchar(255) not null, "message_type" varchar(255) not null, "payload" text not null, "occurred_at" timestamptz not null, "tenant" varchar(255) null);`);
    this.addSql(`alter table "transport"."event_log" add constraint "event_log_identifier_unique" unique ("identifier");`);
    this.addSql(`alter table "transport"."event_log" add constraint "event_log_stream_id_sequence_unique" unique ("stream_id", "sequence");`);

    this.addSql(`create table "oauth_access_token" ("id" varchar(64) not null, "token" text not null, "client_id" varchar(255) not null, "session_id" varchar(255) null, "user_id" varchar(255) null, "reference_id" varchar(255) null, "authorization_code_id" varchar(255) null, "resources" text null, "requested_user_info_claims" text null, "refresh_id" varchar(255) null, "expires_at" timestamptz not null, "created_at" timestamptz not null, "revoked" timestamptz null, "confirmation" jsonb null, "scopes" text not null, primary key ("id"));`);
    this.addSql(`alter table "oauth_access_token" add constraint "oauth_access_token_token_unique" unique ("token");`);

    this.addSql(`create table "oauth_client" ("id" varchar(64) not null, "client_id" varchar(255) not null, "client_secret" text null, "client_discovery_id" varchar(255) null, "disabled" boolean null, "skip_consent" boolean null, "enable_end_session" boolean null, "subject_type" varchar(255) null, "scopes" text null, "client_credentials_scopes" text null, "user_id" varchar(255) null, "created_at" timestamptz null, "updated_at" timestamptz null, "name" varchar(255) null, "uri" text null, "icon" varchar(255) null, "contacts" text null, "tos" varchar(255) null, "policy" varchar(255) null, "software_id" varchar(255) null, "software_version" varchar(255) null, "software_statement" text null, "redirect_uris" text not null, "post_logout_redirect_uris" text null, "backchannel_logout_uri" text null, "backchannel_logout_session_required" boolean null, "token_endpoint_auth_method" text null, "application_type" varchar(255) null, "jwks" text null, "jwks_uri" text null, "grant_types" text null, "response_types" text null, "require_pkce" boolean null, "dpop_bound_access_tokens" boolean null, "reference_id" varchar(255) null, "metadata" jsonb null, primary key ("id"));`);
    this.addSql(`alter table "oauth_client" add constraint "oauth_client_client_id_unique" unique ("client_id");`);

    this.addSql(`create table "oauth_client_assertion" ("id" varchar(64) not null, "expires_at" timestamptz not null, primary key ("id"));`);

    this.addSql(`create table "oauth_client_resource" ("id" varchar(64) not null, "client_id" varchar(255) not null, "resource_id" varchar(255) not null, "metadata" jsonb null, "created_at" timestamptz null, primary key ("id"));`);

    this.addSql(`create table "oauth_consent" ("id" varchar(64) not null, "client_id" varchar(255) not null, "user_id" varchar(255) null, "reference_id" varchar(255) null, "resources" text null, "requested_user_info_claims" text null, "scopes" text not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);

    this.addSql(`create table "oauth_refresh_token" ("id" varchar(64) not null, "token" text not null, "client_id" varchar(255) not null, "session_id" varchar(255) null, "user_id" varchar(255) not null, "reference_id" varchar(255) null, "authorization_code_id" varchar(255) null, "resources" text null, "requested_user_info_claims" text null, "expires_at" timestamptz not null, "created_at" timestamptz not null, "revoked" timestamptz null, "rotated_at" timestamptz null, "rotation_replay_response" varchar(255) null, "rotation_replay_expires_at" timestamptz null, "auth_time" timestamptz null, "confirmation" jsonb null, "scopes" text not null, primary key ("id"));`);
    this.addSql(`alter table "oauth_refresh_token" add constraint "oauth_refresh_token_token_unique" unique ("token");`);

    this.addSql(`create table "oauth_resource" ("id" varchar(64) not null, "identifier" varchar(255) not null, "name" varchar(255) not null, "access_token_ttl" int null, "refresh_token_ttl" int null, "signing_algorithm" varchar(255) null, "signing_key_id" text null, "allowed_scopes" text null, "custom_claims" jsonb null, "dpop_bound_access_tokens_required" boolean null, "disabled" boolean null, "created_at" timestamptz null, "updated_at" timestamptz null, "policy_version" int null, "metadata" jsonb null, primary key ("id"));`);
    this.addSql(`alter table "oauth_resource" add constraint "oauth_resource_identifier_unique" unique ("identifier");`);

    this.addSql(`create table "organization" ("id" varchar(64) not null, "name" varchar(120) not null, "slug" varchar(120) not null, "logo" varchar(255) null, "metadata" text null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table "organization" add constraint "organization_slug_unique" unique ("slug");`);

    this.addSql(`create table "member" ("id" varchar(64) not null, "organization_id" varchar(64) not null, "user_id" varchar(64) not null, "role" varchar(64) not null, "created_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "member_organization_id_user_id_index" on "member" ("organization_id", "user_id");`);

    this.addSql(`create table "invitation" ("id" varchar(64) not null, "organization_id" varchar(64) not null, "email" varchar(320) not null, "role" varchar(64) null, "status" varchar(32) not null, "expires_at" timestamptz not null, "created_at" timestamptz not null, "inviter_id" varchar(64) not null, "team_id" varchar(64) null, primary key ("id"));`);
    this.addSql(`create index "invitation_email_index" on "invitation" ("email");`);

    this.addSql(`create table "session" ("id" varchar(64) not null, "expires_at" timestamptz not null, "token" text not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "ip_address" varchar(255) null, "user_agent" varchar(255) null, "user_id" varchar(255) not null, "active_organization_id" varchar(255) null, "active_team_id" varchar(255) null, "impersonated_by" varchar(255) null, primary key ("id"));`);
    this.addSql(`alter table "session" add constraint "session_token_unique" unique ("token");`);

    this.addSql(`create table "team" ("id" varchar(64) not null, "name" varchar(255) not null, "member_count" int not null, "organization_id" varchar(255) not null, "created_at" timestamptz not null, "updated_at" timestamptz null, primary key ("id"));`);

    this.addSql(`create table "team_member" ("id" varchar(64) not null, "team_id" varchar(255) not null, "user_id" varchar(255) not null, "membership_key" text null, "created_at" timestamptz null, primary key ("id"));`);
    this.addSql(`alter table "team_member" add constraint "team_member_membership_key_unique" unique ("membership_key");`);

    this.addSql(`create table "transport"."transport_message_inbox" ("identifier" varchar(255) not null, "message_type" varchar(255) not null, "origin" varchar(255) null, "received_at" timestamptz not null, primary key ("identifier"));`);

    this.addSql(`create table "two_factor" ("id" varchar(64) not null, "secret" text not null, "backup_codes" text not null, "user_id" varchar(255) not null, "verified" boolean null, "failed_verification_count" int null, "locked_until" timestamptz null, primary key ("id"));`);

    this.addSql(`create table "verification" ("id" varchar(64) not null, "identifier" varchar(255) not null, "value" text not null, "expires_at" timestamptz not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);

    this.addSql(`create or replace function "organization_organization_tenant_schema_fn"() returns trigger as \$\$ begin IF TG_OP = 'INSERT' THEN
          EXECUTE format('create schema if not exists %I', 'tenant_' || NEW.slug);         ELSIF TG_OP = 'DELETE' THEN
          EXECUTE format('drop schema if exists %I cascade', 'tenant_' || OLD.slug);         END IF;         RETURN NULL; end; \$\$ language plpgsql;`);
    this.addSql(`create trigger "organization_tenant_schema" AFTER INSERT OR DELETE on "organization" for each ROW execute function "organization_organization_tenant_schema_fn"();`);

    this.addSql(`alter table "member" add constraint "member_organization_id_foreign" foreign key ("organization_id") references "organization" ("id");`);
    this.addSql(`alter table "member" add constraint "member_user_id_foreign" foreign key ("user_id") references "auth_user" ("id");`);

    this.addSql(`alter table "invitation" add constraint "invitation_organization_id_foreign" foreign key ("organization_id") references "organization" ("id");`);
    this.addSql(`alter table "invitation" add constraint "invitation_inviter_id_foreign" foreign key ("inviter_id") references "auth_user" ("id");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "member" drop constraint "member_user_id_foreign";`);
    this.addSql(`alter table "invitation" drop constraint "invitation_inviter_id_foreign";`);
    this.addSql(`alter table "member" drop constraint "member_organization_id_foreign";`);
    this.addSql(`alter table "invitation" drop constraint "invitation_organization_id_foreign";`);

    this.addSql(`drop table if exists "account" cascade;`);
    this.addSql(`drop table if exists "auth_user" cascade;`);
    this.addSql(`drop table if exists "jwks" cascade;`);
    this.addSql(`drop table if exists "transport"."event_log" cascade;`);
    this.addSql(`drop table if exists "oauth_access_token" cascade;`);
    this.addSql(`drop table if exists "oauth_client" cascade;`);
    this.addSql(`drop table if exists "oauth_client_assertion" cascade;`);
    this.addSql(`drop table if exists "oauth_client_resource" cascade;`);
    this.addSql(`drop table if exists "oauth_consent" cascade;`);
    this.addSql(`drop table if exists "oauth_refresh_token" cascade;`);
    this.addSql(`drop table if exists "oauth_resource" cascade;`);
    this.addSql(`drop trigger if exists "organization_tenant_schema" on "organization";`);
    this.addSql(`drop function if exists "organization_organization_tenant_schema_fn"();`);
    this.addSql(`drop table if exists "organization" cascade;`);
    this.addSql(`drop table if exists "member" cascade;`);
    this.addSql(`drop table if exists "invitation" cascade;`);
    this.addSql(`drop table if exists "session" cascade;`);
    this.addSql(`drop table if exists "team" cascade;`);
    this.addSql(`drop table if exists "team_member" cascade;`);
    this.addSql(`drop table if exists "transport"."transport_message_inbox" cascade;`);
    this.addSql(`drop table if exists "two_factor" cascade;`);
    this.addSql(`drop table if exists "verification" cascade;`);

    this.addSql(`drop schema if exists "transport";`);
  }

}
