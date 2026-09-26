import { Migration } from '@mikro-orm/migrations';

export class Migration20260926174755_calendar_event_sequence extends Migration {

  private getConnectionSchema(): string {
    const em = this.getEntityManager();
    const schema = em.schema || this.config.get('schema');
    return em.getPlatform().quoteIdentifier(schema as string);
  }

  override name = 'Migration20260926174755_calendar_event_sequence';

  override up(): void | Promise<void> {
    const schema = this.getConnectionSchema();

    this.addSql(`alter table ${schema}."calendar_events" add "sequence" int not null default 0;`);
  }

  override down(): void | Promise<void> {
    const schema = this.getConnectionSchema();
    this.addSql(`alter table ${schema}."calendar_events" drop column "sequence";`);
  }

}
