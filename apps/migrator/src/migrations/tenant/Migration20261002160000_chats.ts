import { Migration } from '@mikro-orm/migrations';

export class Migration20261002160000_chats extends Migration {

  private getConnectionSchema(): string {
    const em = this.getEntityManager();
    const schema = em.schema || this.config.get('schema');
    return em.getPlatform().quoteIdentifier(schema as string);
  }

  override name = 'Migration20261002160000_chats';

  override up(): void | Promise<void> {
    const schema = this.getConnectionSchema();

    this.addSql(`create table ${schema}."chats" ("id" varchar(36) not null, "owner_id" varchar(64) not null, "agent_id" varchar(64) not null, "title" varchar(80) null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "chats_owner_id_updated_at_index" on ${schema}."chats" ("owner_id", "updated_at");`);

    this.addSql(`alter table ${schema}."chats" add constraint "chats_owner_id_foreign" foreign key ("owner_id") references "public"."users" ("id") on delete cascade;`);
  }

  override down(): void | Promise<void> {
    const schema = this.getConnectionSchema();
    this.addSql(`drop table if exists ${schema}."chats" cascade;`);
  }

}
