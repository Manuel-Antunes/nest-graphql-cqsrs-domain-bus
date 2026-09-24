import { Migration } from '@mikro-orm/migrations';

export class Migration20260924151026_event_log_trace_context extends Migration {

  override name = 'Migration20260924151026_event_log_trace_context';

  override up(): void | Promise<void> {
    this.addSql(`alter table "transport"."event_log" add "trace_context" jsonb null;`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "transport"."event_log" drop column "trace_context";`);
  }

}
