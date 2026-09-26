import { Migration } from '@mikro-orm/migrations';

export class Migration20260925012004_calendar_events extends Migration {

  private getConnectionSchema(): string {
    const em = this.getEntityManager();
    const schema = em.schema || this.config.get('schema');
    return em.getPlatform().quoteIdentifier(schema as string);
  }

  override name = 'Migration20260925012004_calendar_events';

  override up(): void | Promise<void> {
    const schema = this.getConnectionSchema();

    this.addSql(`create table ${schema}."calendar_events" ("id" varchar(36) not null, "title" varchar(200) not null, "description" text null, "start_date" timestamptz not null, "end_date" timestamptz not null, "color" varchar(16) not null, "responsible_id" varchar(36) not null, "team_id" varchar(64) null, "created_at" timestamptz not null, "updated_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`create index "calendar_events_start_date_id_index" on ${schema}."calendar_events" ("start_date", "id");`);

    this.addSql(`create table ${schema}."calendar_events_participants" ("calendar_event_id" varchar(36) not null, "user_id" varchar(36) not null, primary key ("calendar_event_id", "user_id"));`);

    this.addSql(`alter table ${schema}."calendar_events" add constraint "calendar_events_responsible_id_foreign" foreign key ("responsible_id") references ${schema}."users" ("id");`);
    this.addSql(`alter table ${schema}."calendar_events" add constraint "calendar_events_team_id_foreign" foreign key ("team_id") references "public"."team" ("id") on delete set null;`);

    this.addSql(`alter table ${schema}."calendar_events_participants" add constraint "calendar_events_participants_calendar_event_id_foreign" foreign key ("calendar_event_id") references ${schema}."calendar_events" ("id") on update cascade on delete cascade;`);
    this.addSql(`alter table ${schema}."calendar_events_participants" add constraint "calendar_events_participants_user_id_foreign" foreign key ("user_id") references ${schema}."users" ("id") on update cascade on delete cascade;`);
  }

  override down(): void | Promise<void> {
    const schema = this.getConnectionSchema();
    this.addSql(`alter table ${schema}."calendar_events_participants" drop constraint "calendar_events_participants_calendar_event_id_foreign";`);

    this.addSql(`drop table if exists ${schema}."calendar_events" cascade;`);
    this.addSql(`drop table if exists ${schema}."calendar_events_participants" cascade;`);
  }

}
