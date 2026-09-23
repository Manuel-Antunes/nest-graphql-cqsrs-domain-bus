import { AuthConfiguration, DEFAULT_AUTH_BASE_PATH } from './config';

describe('the auth configuration', () => {
  const env = (overrides: Record<string, string | undefined>) =>
    ({ AUTH_URL: 'http://localhost:3000', ...overrides }) as NodeJS.ProcessEnv;

  describe('what the browser needs to KEEP the cookie', () => {
    it('a production build on loopback is still not a deployment', () => {
      expect(
        AuthConfiguration.cookieSecurity(
          'http://localhost:3000',
          'production',
          'example.com',
        ),
      ).toEqual({
        cookieDomain: undefined,
        secure: false,
      });
    });

    it('a real origin in production gets Secure and the shared domain', () => {
      expect(
        AuthConfiguration.cookieSecurity(
          'https://api.example.com',
          'production',
          'example.com',
        ),
      ).toEqual({
        cookieDomain: 'example.com',
        secure: true,
      });
    });

    it('development never gets Secure, whatever the origin', () => {
      expect(
        AuthConfiguration.cookieSecurity(
          'https://api.example.com',
          'development',
          'example.com',
        ),
      ).toEqual({
        cookieDomain: undefined,
        secure: false,
      });
    });

    it('knows the loopback names apart from a host that merely looks local', () => {
      expect(AuthConfiguration.isLoopback('http://127.0.0.1:3000')).toBe(true);
      expect(AuthConfiguration.isLoopback('http://[::1]:3000')).toBe(true);
      expect(
        AuthConfiguration.isLoopback('https://localhost.example.com'),
      ).toBe(false);
      expect(AuthConfiguration.isLoopback('not a url')).toBe(false);
    });
  });

  describe('the trusted origins are the two ends of this system', () => {
    it('defaults to the api and the web, with no duplicates', () => {
      const config = AuthConfiguration.fromEnvironment(
        env({ WEB_URL: 'http://localhost:4200' }),
      );

      expect(config.trustedOrigins).toEqual([
        'http://localhost:3000',
        'http://localhost:4200',
      ]);
      expect(config.basePath).toBe(DEFAULT_AUTH_BASE_PATH);
    });

    it('collapses the pair when the web IS the api', () => {
      expect(
        AuthConfiguration.fromEnvironment(
          env({ WEB_URL: 'http://localhost:3000' }),
        ).trustedOrigins,
      ).toEqual(['http://localhost:3000']);
    });

    it('an explicit list replaces the defaults, trimmed', () => {
      const config = AuthConfiguration.fromEnvironment(
        env({
          AUTH_TRUSTED_ORIGINS:
            'https://a.example.com, https://b.example.com ,',
        }),
      );

      expect(config.trustedOrigins).toEqual([
        'https://a.example.com',
        'https://b.example.com',
      ]);
    });
  });

  describe('a social provider is configured or it is absent', () => {
    it('carries the pair it was given', () => {
      const config = AuthConfiguration.fromEnvironment(
        env({ AUTH_GOOGLE_ID: 'id', AUTH_GOOGLE_SECRET: 'secret' }),
      );

      expect(config.googleClientId).toBe('id');
      expect(config.googleClientSecret).toBe('secret');
    });

    it('refuses a base url that is not one', () => {
      expect(() =>
        AuthConfiguration.fromEnvironment(env({ AUTH_URL: 'nonsense' })),
      ).toThrow();
    });
  });
});
