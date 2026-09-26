import { Poll } from '../../support/poll';
import type { Database } from './database';

export class AppendFaults {
  private static readonly SCHEMA = '"transport"';

  constructor(private readonly database: Database) {}

  async failAppendsOf(messageType: string, times: number): Promise<void> {
    await this.clear();
    const schema = AppendFaults.SCHEMA;
    await this.database.execute(`create sequence ${schema}.e2e_fault_attempts`);
    await this.database.execute(
      `create table ${schema}.e2e_fault (message_type text not null, failures integer not null)`,
    );
    await this.database.execute(
      `insert into ${schema}.e2e_fault (message_type, failures) values (?, ?)`,
      messageType,
      times,
    );
    await this.database.execute(`
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
    await this.database.execute(
      `create trigger e2e_fault before insert on ${schema}.event_log
         for each row execute function ${schema}.e2e_fault()`,
    );
  }

  async attempts(): Promise<number> {
    const [row] = await this.database.query<{
      last_value: number;
      is_called: boolean;
    }>(
      `select last_value, is_called from ${AppendFaults.SCHEMA}.e2e_fault_attempts`,
    );
    return row?.is_called ? Number(row.last_value) : 0;
  }

  whenAttempted(times: number, timeoutMs: number): Promise<number | undefined> {
    return Poll.until(async () => {
      const attempts = await this.attempts();
      return attempts >= times ? attempts : undefined;
    }, timeoutMs);
  }

  async clear(): Promise<void> {
    const schema = AppendFaults.SCHEMA;
    await this.database.execute(
      `drop trigger if exists e2e_fault on ${schema}.event_log`,
    );
    await this.database.execute(
      `drop function if exists ${schema}.e2e_fault()`,
    );
    await this.database.execute(`drop table if exists ${schema}.e2e_fault`);
    await this.database.execute(
      `drop sequence if exists ${schema}.e2e_fault_attempts`,
    );
  }
}
