import { Migration } from '@mikro-orm/migrations';

export class Migration20260922172518_unify_event_log extends Migration {

  override name = 'Migration20260922172518_unify_event_log';

  override up(): void | Promise<void> {
    this.addSql(`alter table "tagging"."event_log" drop constraint "event_log_pkey";`);
    this.addSql(`alter table "tagging"."event_log" add "position" bigserial primary key;`);
    this.addSql(`alter table "tagging"."event_log" alter column "stream_id" drop not null;`);
    this.addSql(`alter table "tagging"."event_log" alter column "sequence" drop not null;`);
    this.addSql(`alter table "tagging"."event_log" add constraint "event_log_stream_id_sequence_unique" unique ("stream_id", "sequence");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "tagging"."event_log" drop constraint "event_log_stream_id_sequence_unique";`);
    this.addSql(`alter table "tagging"."event_log" drop constraint "event_log_pkey";`);
    this.addSql(`alter table "tagging"."event_log" drop column "position";`);
    this.addSql(`alter table "tagging"."event_log" alter column "stream_id" set not null;`);
    this.addSql(`alter table "tagging"."event_log" alter column "sequence" set not null;`);
    this.addSql(`alter table "tagging"."event_log" add primary key ("stream_id", "sequence");`);
  }

}
