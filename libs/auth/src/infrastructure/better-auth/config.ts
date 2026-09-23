import { z } from 'zod';

export const AuthConfigSchema = z.object({
  baseUrl: z.url(),
  basePath: z.string().startsWith('/'),
  secret: z.string().min(1),
  webUrl: z.url(),
  trustedOrigins: z.array(z.string()),
  cookieDomain: z.string().optional(),
  secure: z.boolean(),
  googleClientId: z.string().optional(),
  googleClientSecret: z.string().optional(),
  githubClientId: z.string().optional(),
  githubClientSecret: z.string().optional(),
});

export type AuthConfig = z.infer<typeof AuthConfigSchema>;

export const DEFAULT_AUTH_SECRET =
  'nest-graphql-posts-dev-secret-nao-use-em-producao';

export const DEFAULT_AUTH_BASE_PATH = '/api/auth';

export const DEFAULT_WEB_URL = 'http://localhost:4200';

export class AuthConfiguration {
  private static readonly LOOPBACK = ['localhost', '127.0.0.1', '[::1]', '::1'];

  private static readonly CSV = z.string().transform((value) =>
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  );

  /** Is this base URL the developer's own machine? */
  static isLoopback(url: string): boolean {
    try {
      return AuthConfiguration.LOOPBACK.includes(new URL(url).hostname);
    } catch {
      return false;
    }
  }

  /**
   * The two cookie attributes that decide whether the browser KEEPS the session: `secure` (dropped
   * over plain HTTP) and the cross-subdomain `domain` (dropped when it does not match the origin).
   *
   * Both are read from the URL and `NODE_ENV` **together**, never from `NODE_ENV` alone: a production
   * build served on localhost would otherwise issue `Secure; Domain=…` cookies the browser drops, and
   * every login would succeed and bounce straight back to the sign-in page.
   */
  static cookieSecurity(
    baseUrl: string,
    nodeEnv: string | undefined,
    cookieDomain: string | undefined,
  ): Pick<AuthConfig, 'cookieDomain' | 'secure'> {
    const deployed =
      nodeEnv === 'production' && !AuthConfiguration.isLoopback(baseUrl);
    return {
      cookieDomain: deployed ? cookieDomain || undefined : undefined,
      secure: deployed,
    };
  }

  static fromEnvironment(env: NodeJS.ProcessEnv = process.env): AuthConfig {
    const baseUrl = env.AUTH_URL ?? `http://localhost:${env.PORT ?? 3000}`;
    const webUrl = env.WEB_URL ?? DEFAULT_WEB_URL;
    const trustedOrigins = env.AUTH_TRUSTED_ORIGINS
      ? AuthConfiguration.CSV.parse(env.AUTH_TRUSTED_ORIGINS)
      : [baseUrl, webUrl];

    return AuthConfigSchema.parse({
      baseUrl,
      basePath: env.AUTH_BASE_PATH ?? DEFAULT_AUTH_BASE_PATH,
      secret: env.AUTH_SECRET ?? DEFAULT_AUTH_SECRET,
      webUrl,
      trustedOrigins: [...new Set(trustedOrigins)],
      googleClientId: env.AUTH_GOOGLE_ID,
      googleClientSecret: env.AUTH_GOOGLE_SECRET,
      githubClientId: env.AUTH_GITHUB_ID,
      githubClientSecret: env.AUTH_GITHUB_SECRET,
      ...AuthConfiguration.cookieSecurity(
        baseUrl,
        env.NODE_ENV,
        env.AUTH_COOKIE_DOMAIN,
      ),
    });
  }
}
