import { Migration } from '@mikro-orm/migrations';

export class Migration20260928120000_event_store_tags extends Migration {

  override name = 'Migration20260928120000_event_store_tags';

  override up(): void | Promise<void> {
    this.addSql(`alter table "transport"."event_log" add "metadata" jsonb not null default '{}', add "tags" text[] not null default '{}';`);
    this.addSql(`update "transport"."event_log" set "metadata" = coalesce("trace_context", '{}'::jsonb);`);
    this.addSql(`update "transport"."event_log" as "e" set "tags" = coalesce((select array["t"."key" || '=' || "e"."stream_id"] from jsonb_each("e"."payload"::jsonb) as "t" where "t"."value" #>> '{}' = "e"."stream_id" or "t"."value" ->> 'value' = "e"."stream_id" order by "t"."key" limit 1), '{}') where "e"."stream_id" is not null;`);
    this.addSql(`alter table "transport"."event_log" drop constraint if exists "event_log_stream_id_sequence_unique";`);
    this.addSql(`alter table "transport"."event_log" drop column "stream_id", drop column "sequence", drop column "trace_context";`);
    this.addSql(`create index "event_log_tags_gin" on "transport"."event_log" using gin ("tags");`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop index if exists "transport"."event_log_tags_gin";`);
    this.addSql(`alter table "transport"."event_log" add "stream_id" varchar(255) null, add "sequence" int null, add "trace_context" jsonb null;`);
    this.addSql(`update "transport"."event_log" set "stream_id" = nullif(split_part("tags"[1], '=', 2), '') where cardinality("tags") > 0;`);
    this.addSql(`update "transport"."event_log" as "e" set "sequence" = "s"."sequence" from (select "position", row_number() over (partition by "stream_id" order by "position") - 1 as "sequence" from "transport"."event_log" where "stream_id" is not null) as "s" where "e"."position" = "s"."position";`);
    this.addSql(`update "transport"."event_log" set "trace_context" = nullif((select jsonb_object_agg("key", "value") from jsonb_each("metadata") where "key" in ('traceparent', 'tracestate', 'baggage')), 'null'::jsonb);`);
    this.addSql(`alter table "transport"."event_log" add constraint "event_log_stream_id_sequence_unique" unique ("stream_id", "sequence");`);
    this.addSql(`alter table "transport"."event_log" drop column "metadata", drop column "tags";`);
  }

}
