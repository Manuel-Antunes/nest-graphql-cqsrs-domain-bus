import { Migration } from '@mikro-orm/migrations';

export class Migration20260924124450_default_tag extends Migration {

  private getConnectionSchema(): string {
    const em = this.getEntityManager();
    const schema = em.schema || this.config.get('schema');
    return em.getPlatform().quoteIdentifier(schema as string);
  }

  override name = 'Migration20260924124450_default_tag';

  override up(): void | Promise<void> {
    const schema = this.getConnectionSchema();

    this.addSql(`insert into ${schema}."tags" ("id", "name", "created_at") values ('00000000-0000-4000-8000-000000000001', 'Untagged', now()) on conflict ("id") do nothing;`);
  }

  override down(): void | Promise<void> {
    const schema = this.getConnectionSchema();
    this.addSql(`delete from ${schema}."tags" where "id" = '00000000-0000-4000-8000-000000000001';`);
  }

}
