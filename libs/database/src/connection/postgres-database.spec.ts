import { postgresDatabase } from './postgres-database';
import { SYSTEM_SCHEMA } from './schemas';

describe('postgresDatabase', () => {
  const database = {
    clientUrl: 'postgresql://configured:5432/db',
    debug: true,
  };

  it('connects to the system schema unless told otherwise', () => {
    expect(postgresDatabase({}, database)).toMatchObject({
      schema: SYSTEM_SCHEMA,
    });
    expect(postgresDatabase({ schema: 'elsewhere' }, database)).toMatchObject({
      schema: 'elsewhere',
    });
  });

  it('connects where the configuration says, with its debug flag', () => {
    expect(postgresDatabase({}, database)).toMatchObject(database);
  });

  it('leaves the schema to the migrations, and only makes sure the database is there', () => {
    expect(postgresDatabase({}, database)).toMatchObject({
      ensureDatabase: { create: false },
    });
  });

  it('lets the caller override anything it decided', () => {
    expect(
      postgresDatabase(
        { ensureDatabase: false, allowGlobalContext: true, debug: false },
        database,
      ),
    ).toMatchObject({
      ensureDatabase: false,
      allowGlobalContext: true,
      debug: false,
    });
  });
});
