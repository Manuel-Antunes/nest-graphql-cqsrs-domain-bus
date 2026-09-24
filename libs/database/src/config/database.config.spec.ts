import {
  DEFAULT_POSTGRES_URL,
  databaseConfig,
  postgresDatabase,
  postgresUrl,
  SYSTEM_SCHEMA,
} from './database.config';

describe('postgresDatabase', () => {
  const url = process.env.POSTGRES_URL;

  afterEach(() => {
    process.env.POSTGRES_URL = url;
    delete process.env.MIKRO_ORM_DEBUG;
  });

  it('connects to the system schema unless told otherwise', () => {
    expect(postgresDatabase()).toMatchObject({
      schema: SYSTEM_SCHEMA,
      clientUrl: postgresUrl(),
    });
    expect(postgresDatabase('elsewhere')).toMatchObject({
      schema: 'elsewhere',
    });
  });

  it('leaves the schema to the migrations, and only makes sure the database is there', () => {
    expect(postgresDatabase()).toMatchObject({
      ensureDatabase: { create: false },
    });
  });

  it('falls back to the connection the compose file publishes', () => {
    delete process.env.POSTGRES_URL;

    expect(postgresUrl()).toBe(DEFAULT_POSTGRES_URL);
  });

  it('reads the debug flag off the environment', () => {
    expect(databaseConfig().debug).toBe(false);

    process.env.MIKRO_ORM_DEBUG = 'true';

    expect(databaseConfig().debug).toBe(true);
  });

  it('lets the caller override anything it decided', () => {
    const config = postgresDatabase(SYSTEM_SCHEMA, {
      ensureDatabase: false,
      allowGlobalContext: true,
    });

    expect(config).toMatchObject({
      ensureDatabase: false,
      allowGlobalContext: true,
    });
  });

  it('refuses a schema with no name', () => {
    expect(() => databaseConfig('')).toThrow();
  });
});
