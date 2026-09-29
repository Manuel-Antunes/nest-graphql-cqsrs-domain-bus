import { authConfig } from './auth.config';

describe('authConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const withEnv = (env: Record<string, string>) => {
    for (const name of [
      'AUTH_URL',
      'PORT',
      'NODE_ENV',
      'WEB_URL',
      'GATEWAY_URL',
      'AUTH_BASE_PATH',
      'AUTH_ISSUER',
      'AUTH_OAUTH_RESOURCES',
      'AUTH_TRUSTED_ORIGINS',
      'AUTH_COOKIE_DOMAIN',
      'AUTH_GOOGLE_ID',
      'AUTH_GOOGLE_SECRET',
      'AUTH_GITHUB_ID',
      'AUTH_GITHUB_SECRET',
    ]) {
      vi.stubEnv(name, env[name]);
    }
    return authConfig();
  };

  describe('what the browser needs to KEEP the cookie', () => {
    it('a production build on loopback is still not a deployment', () => {
      expect(
        withEnv({
          AUTH_URL: 'http://localhost:3000',
          NODE_ENV: 'production',
          AUTH_COOKIE_DOMAIN: 'example.com',
        }),
      ).toMatchObject({ cookieDomain: undefined, secure: false });
    });

    it('a real origin in production gets Secure and the shared domain', () => {
      expect(
        withEnv({
          AUTH_URL: 'https://api.example.com',
          NODE_ENV: 'production',
          AUTH_COOKIE_DOMAIN: 'example.com',
        }),
      ).toMatchObject({ cookieDomain: 'example.com', secure: true });
    });

    it('development never gets Secure, whatever the origin', () => {
      expect(
        withEnv({
          AUTH_URL: 'https://api.example.com',
          NODE_ENV: 'development',
          AUTH_COOKIE_DOMAIN: 'example.com',
        }),
      ).toMatchObject({ cookieDomain: undefined, secure: false });
    });

    it('knows the loopback names apart from a host that merely looks local', () => {
      const secureOn = (url: string) =>
        withEnv({ AUTH_URL: url, NODE_ENV: 'production' }).secure;

      expect(secureOn('http://127.0.0.1:3000')).toBe(false);
      expect(secureOn('http://[::1]:3000')).toBe(false);
      expect(secureOn('https://localhost.example.com')).toBe(true);
    });
  });

  describe('the base url is the origin this process answers on', () => {
    it('defaults to the port the process listens on, which is how the web gets its own', () => {
      expect(withEnv({ PORT: '4200' }).baseUrl).toBe('http://localhost:4200');
      expect(withEnv({}).baseUrl).toBe('http://localhost:3000');
    });

    it('refuses a base url that is not one', () => {
      expect(() => withEnv({ AUTH_URL: 'nonsense' })).toThrow();
    });
  });

  describe('the trusted origins are the two ends of this system', () => {
    it('defaults to the api and the web, with no duplicates', () => {
      const config = withEnv({
        AUTH_URL: 'http://localhost:3000',
        WEB_URL: 'http://localhost:4200',
      });

      expect(config.trustedOrigins).toEqual([
        'http://localhost:3000',
        'http://localhost:4200',
      ]);
      expect(config.basePath).toBe('/api/auth');
    });

    it('collapses the pair when the web IS the api', () => {
      expect(
        withEnv({
          AUTH_URL: 'http://localhost:3000',
          WEB_URL: 'http://localhost:3000',
        }).trustedOrigins,
      ).toEqual(['http://localhost:3000']);
    });

    it('an explicit list replaces the defaults, trimmed', () => {
      expect(
        withEnv({
          AUTH_TRUSTED_ORIGINS:
            'https://a.example.com, https://b.example.com ,',
        }).trustedOrigins,
      ).toEqual(['https://a.example.com', 'https://b.example.com']);
    });
  });

  describe('the tokens are issued by the web, for the gateway', () => {
    it('defaults the issuer to the web and the one resource to the gateway', () => {
      expect(
        withEnv({
          WEB_URL: 'https://posts.example.com',
          GATEWAY_URL: 'https://api.example.com/graphql',
        }),
      ).toMatchObject({
        issuer: 'https://posts.example.com',
        oauthResources: ['https://api.example.com/graphql'],
      });
    });

    it('an explicit list of resources replaces the gateway, and refuses what is not a url', () => {
      expect(
        withEnv({
          AUTH_OAUTH_RESOURCES: 'https://a.example.com, https://b.example.com',
        }).oauthResources,
      ).toEqual(['https://a.example.com', 'https://b.example.com']);
      expect(() => withEnv({ AUTH_OAUTH_RESOURCES: 'nonsense' })).toThrow();
    });
  });

  describe('a social provider is configured or it is absent', () => {
    it('carries the pair it was given', () => {
      expect(
        withEnv({ AUTH_GOOGLE_ID: 'id', AUTH_GOOGLE_SECRET: 'secret' }).google,
      ).toEqual({ clientId: 'id', clientSecret: 'secret' });
    });

    it('a half-filled pair, or one declared empty, is no provider', () => {
      expect(withEnv({ AUTH_GITHUB_ID: 'id' }).github).toBeNull();
      expect(
        withEnv({ AUTH_GOOGLE_ID: '', AUTH_GOOGLE_SECRET: '' }).google,
      ).toBeNull();
    });
  });
});
