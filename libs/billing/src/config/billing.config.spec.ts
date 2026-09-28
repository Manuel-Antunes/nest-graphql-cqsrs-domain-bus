import { billingConfig } from './billing.config';

describe('billingConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const withEnv = (env: Record<string, string>) => {
    for (const name of [
      'POLAR_ACCESS_TOKEN',
      'POLAR_ENVIRONMENT',
      'POLAR_WEBHOOK_SECRET',
      'WEB_URL',
    ]) {
      vi.stubEnv(name, env[name] ?? '');
    }
    return billingConfig();
  };

  it('is off without an access token, which is what CI and the e2e suite run with', () => {
    expect(withEnv({}).polar).toBeNull();
    expect(withEnv({ POLAR_ACCESS_TOKEN: '' }).polar).toBeNull();
  });

  it('defaults to the sandbox, even when the environment is declared but empty', () => {
    expect(
      withEnv({ POLAR_ACCESS_TOKEN: 'token', POLAR_ENVIRONMENT: '' }).polar,
    ).toEqual({ accessToken: 'token', server: 'sandbox' });
  });

  it('reads production and the webhook secret when they are set', () => {
    expect(
      withEnv({
        POLAR_ACCESS_TOKEN: 'token',
        POLAR_ENVIRONMENT: 'production',
        POLAR_WEBHOOK_SECRET: 'secret',
      }).polar,
    ).toEqual({
      accessToken: 'token',
      server: 'production',
      webhookSecret: 'secret',
    });
  });

  it('refuses an environment Polar does not have', () => {
    expect(() =>
      withEnv({ POLAR_ACCESS_TOKEN: 'token', POLAR_ENVIRONMENT: 'staging' }),
    ).toThrow();
  });

  it('points the emails at the billing settings of the web', () => {
    expect(withEnv({}).settingsUrl).toBe(
      'http://localhost:4200/settings/billing',
    );
    expect(withEnv({ WEB_URL: 'https://posts.example.com' }).settingsUrl).toBe(
      'https://posts.example.com/settings/billing',
    );
  });
});
