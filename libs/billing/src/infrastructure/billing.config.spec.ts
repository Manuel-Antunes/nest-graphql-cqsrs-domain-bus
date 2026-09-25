import { BillingConfiguration } from './billing.config';

describe('BillingConfiguration', () => {
  it('is off without an access token, which is what CI and the e2e suite run with', () => {
    expect(BillingConfiguration.fromEnvironment({})).toBeNull();
    expect(
      BillingConfiguration.fromEnvironment({ POLAR_ACCESS_TOKEN: '' }),
    ).toBeNull();
  });

  it('defaults to the sandbox, even when the environment is declared but empty', () => {
    expect(
      BillingConfiguration.fromEnvironment({
        POLAR_ACCESS_TOKEN: 'token',
        POLAR_ENVIRONMENT: '',
      }),
    ).toEqual({ accessToken: 'token', server: 'sandbox' });
  });

  it('reads production and the webhook secret when they are set', () => {
    expect(
      BillingConfiguration.fromEnvironment({
        POLAR_ACCESS_TOKEN: 'token',
        POLAR_ENVIRONMENT: 'production',
        POLAR_WEBHOOK_SECRET: 'secret',
      }),
    ).toEqual({
      accessToken: 'token',
      server: 'production',
      webhookSecret: 'secret',
    });
  });

  it('refuses an environment Polar does not have', () => {
    expect(() =>
      BillingConfiguration.fromEnvironment({
        POLAR_ACCESS_TOKEN: 'token',
        POLAR_ENVIRONMENT: 'staging',
      }),
    ).toThrow();
  });
});
