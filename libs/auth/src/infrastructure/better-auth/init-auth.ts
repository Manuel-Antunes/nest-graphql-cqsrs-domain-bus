import { betterAuth, type BetterAuthOptions, type BetterAuthPlugin } from 'better-auth';
import type { AuthConfig } from './config';
import type { BetterAuthCorePlugins, BetterAuthPluginsWith } from './plugins/registry';

export const AUTH_USER_MODEL = 'authUser';

export const APP_NAME = 'nest-graphql-posts';

type Database = NonNullable<BetterAuthOptions['database']>;

export type BetterAuthLogWriter = (
  level: 'info' | 'warn' | 'error' | 'debug',
  message: string,
  ...args: unknown[]
) => void;

export class BetterAuthLogging {
  /** Better Auth's logger, writing wherever the runtime writes — Nest's `Logger`, or the console. */
  static through(write: BetterAuthLogWriter): BetterAuthOptions['logger'] {
    return {
      disabled: false,
      level: process.env.NODE_ENV === 'production' ? 'warn' : 'debug',
      disableColors: true,
      log: (level, message, ...args) => write(level, message, ...args),
    };
  }

  static readonly toConsole: BetterAuthLogWriter = (level, message, ...args) => {
    const write = console[level === 'debug' ? 'log' : level] ?? console.log;
    write(`[better-auth] ${message}`, ...args);
  };
}

class SocialProviders {
  /** A provider is configured or it is absent — a half-filled pair is neither. */
  static of(config: AuthConfig): BetterAuthOptions['socialProviders'] {
    return {
      ...(config.googleClientId && config.googleClientSecret
        ? { google: { clientId: config.googleClientId, clientSecret: config.googleClientSecret } }
        : {}),
      ...(config.githubClientId && config.githubClientSecret
        ? { github: { clientId: config.githubClientId, clientSecret: config.githubClientSecret } }
        : {}),
    };
  }
}

export interface InitAuthOptions {
  readonly hooks?: BetterAuthOptions['hooks'];
  readonly logger?: BetterAuthOptions['logger'];
}

export class BetterAuthInstance {
  static optionsFor<TPlugins extends readonly BetterAuthPlugin[]>(config: AuthConfig, plugins: TPlugins) {
    return {
      appName: APP_NAME,
      secret: config.secret,
      baseURL: config.baseUrl,
      basePath: config.basePath,
      user: { modelName: AUTH_USER_MODEL },
      emailAndPassword: { enabled: true, autoSignIn: true, requireEmailVerification: false },
      account: {
        accountLinking: { enabled: true, trustedProviders: ['credential', 'google', 'github'] },
      },
      databaseHooks: {},
      socialProviders: SocialProviders.of(config),
      plugins: [...plugins],
      advanced: {
        crossSubDomainCookies: {
          enabled: Boolean(config.cookieDomain),
          domain: config.cookieDomain,
        },
        defaultCookieAttributes: {
          sameSite: config.secure ? 'none' : 'lax',
          secure: config.secure,
        },
      },
      trustedOrigins: config.trustedOrigins,
    } satisfies BetterAuthOptions;
  }

  static create<TPlugins extends readonly BetterAuthPlugin[]>(
    config: AuthConfig,
    database: Database,
    plugins: TPlugins,
    {
      hooks = {},
      logger = BetterAuthLogging.through(BetterAuthLogging.toConsole),
    }: InitAuthOptions = {},
  ) {
    return betterAuth({
      ...BetterAuthInstance.optionsFor(config, plugins),
      database,
      hooks,
      logger,
    });
  }
}

export type BetterAuth = ReturnType<typeof BetterAuthInstance.create<BetterAuthCorePlugins>>;

export type BetterAuthWith<TExtra extends readonly unknown[]> = ReturnType<
  typeof BetterAuthInstance.create<BetterAuthPluginsWith<TExtra> & readonly BetterAuthPlugin[]>
>;
