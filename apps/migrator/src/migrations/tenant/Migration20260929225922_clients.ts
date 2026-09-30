import { Migration } from '@mikro-orm/migrations';

export class Migration20260929225922_clients extends Migration {

  private getConnectionSchema(): string {
    const em = this.getEntityManager();
    const schema = em.schema || this.config.get('schema');
    return em.getPlatform().quoteIdentifier(schema as string);
  }

  override name = 'Migration20260929225922_clients';

  override up(): void | Promise<void> {
    const schema = this.getConnectionSchema();

    this.addSql(`create table ${schema}."clients" ("id" varchar(36) not null, "name" varchar(200) not null, "kind" varchar(32) not null, "cpf" varchar(11) not null, "rg" varchar(200) null, "birth_date" timestamptz null, "death_date" timestamptz null, "is_deceased" boolean not null default false, "occupation" varchar(200) null, "union_membership" varchar(200) null, "notes" text null, "has_pending_litigation" boolean not null default false, "has_renounced" boolean not null default false, "is_qualified" boolean not null default false, "documentation_complete" boolean not null default false, "address_street" varchar(200) null, "address_number" varchar(200) null, "address_complement" varchar(200) null, "address_city" varchar(200) null, "address_state" varchar(200) null, "address_zip_code" varchar(200) null, "status" varchar(16) not null, "created_by_id" varchar(64) null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "clients_name_id_index" on ${schema}."clients" ("name", "id");`);
    this.addSql(`alter table ${schema}."clients" add constraint "clients_cpf_unique" unique ("cpf");`);

    this.addSql(`alter table ${schema}."clients" add constraint "clients_created_by_id_foreign" foreign key ("created_by_id") references "public"."users" ("id") on delete set null;`);
  }

  override down(): void | Promise<void> {
    const schema = this.getConnectionSchema();
    this.addSql(`drop table if exists ${schema}."clients" cascade;`);
  }

}
