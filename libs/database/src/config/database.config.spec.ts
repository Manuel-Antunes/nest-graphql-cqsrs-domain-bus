import { databaseConfig } from './database.config';

describe('databaseConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const withEnv = (env: Record<string, string>) => {
    for (const name of ['POSTGRES_URL', 'MIKRO_ORM_DEBUG']) {
      vi.stubEnv(name, env[name]);
    }
    return databaseConfig();
  };

  it('falls back to the connection the compose file publishes', () => {
    expect(withEnv({})).toEqual({
      clientUrl: 'postgresql://nestposts:nestposts@localhost:5432/nestposts',
      debug: false,
    });
  });

  it('reads the url and the debug flag off the environment', () => {
    expect(
      withEnv({
        POSTGRES_URL: 'postgresql://elsewhere:5432/db',
        MIKRO_ORM_DEBUG: 'true',
      }),
    ).toEqual({ clientUrl: 'postgresql://elsewhere:5432/db', debug: true });
  });

  it('refuses a debug flag that is not one', () => {
    expect(() => withEnv({ MIKRO_ORM_DEBUG: 'sometimes' })).toThrow();
  });
});
