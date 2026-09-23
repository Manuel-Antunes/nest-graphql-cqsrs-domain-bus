import type { ServiceDatabase } from './database';

export class AppendFaults {
  constructor(private readonly store: ServiceDatabase) {}

  private get schema(): string {
    return `"${this.store.schema}"`;
  }

  async failAppendsOf(messageType: string, times: number): Promise<void> {
    await this.clear();
    const schema = this.schema;
    await this.store.execute(`create sequence ${schema}.e2e_fault_attempts`);
    await this.store.execute(
      `create table ${schema}.e2e_fault (message_type text not null, failures integer not null)`,
    );
    await this.store.execute(
      `insert into ${schema}.e2e_fault (message_type, failures) values (?, ?)`,
      messageType,
      times,
    );
    await this.store.execute(`
      create function ${schema}.e2e_fault() returns trigger language plpgsql as $$
      declare
        armed integer;
        attempt bigint;
      begin
        select failures into armed from ${schema}.e2e_fault
         where new.message_type like message_type || '%';
        if armed is null then
          return new;
        end if;
        if exists (select 1 from ${schema}.event_log where identifier = new.identifier) then
          return new;
        end if;
        attempt := nextval('${schema}.e2e_fault_attempts');
        if attempt <= armed then
          raise exception 'e2e: injected failure % of % appending %', attempt, armed, new.message_type;
        end if;
        return new;
      end
      $$`);
    await this.store.execute(
      `create trigger e2e_fault before insert on ${schema}.event_log
         for each row execute function ${schema}.e2e_fault()`,
    );
  }

  async attempts(): Promise<number> {
    const [row] = await this.store.query<{
      last_value: number;
      is_called: boolean;
    }>(`select last_value, is_called from ${this.schema}.e2e_fault_attempts`);
    return row?.is_called ? Number(row.last_value) : 0;
  }

  async clear(): Promise<void> {
    const schema = this.schema;
    await this.store.execute(
      `drop trigger if exists e2e_fault on ${schema}.event_log`,
    );
    await this.store.execute(`drop function if exists ${schema}.e2e_fault()`);
    await this.store.execute(`drop table if exists ${schema}.e2e_fault`);
    await this.store.execute(
      `drop sequence if exists ${schema}.e2e_fault_attempts`,
    );
  }
}
