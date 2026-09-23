import {
  DEFAULT_POSTGRES_URL,
  databaseConfig,
  postgresDatabase,
  postgresUrl,
} from './database.config';

describe('postgresDatabase', () => {
  const url = process.env.POSTGRES_URL;

  afterEach(() => {
    process.env.POSTGRES_URL = url;
    delete process.env.MIKRO_ORM_DEBUG;
  });

  it('puts the service in a schema of its own on the shared connection', () => {
    expect(postgresDatabase('posts')).toMatchObject({
      schema: 'posts',
      clientUrl: postgresUrl(),
    });
    expect(postgresDatabase('tagging')).toMatchObject({ schema: 'tagging' });
  });

  it('leaves the schema to the migrations, and only makes sure the database is there', () => {
    expect(postgresDatabase('posts')).toMatchObject({
      ensureDatabase: { create: false },
    });
  });

  it('falls back to the connection the compose file publishes', () => {
    delete process.env.POSTGRES_URL;

    expect(postgresUrl()).toBe(DEFAULT_POSTGRES_URL);
  });

  it('reads the debug flag off the environment', () => {
    expect(databaseConfig('posts').debug).toBe(false);

    process.env.MIKRO_ORM_DEBUG = 'true';

    expect(databaseConfig('posts').debug).toBe(true);
  });

  it('lets the caller override anything it decided', () => {
    const config = postgresDatabase('posts', {
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
