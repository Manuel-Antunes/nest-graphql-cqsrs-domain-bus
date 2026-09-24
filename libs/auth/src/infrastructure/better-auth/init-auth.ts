import { Email } from '@nestposts/users/domain/user/vo/email';
import { UserName } from '@nestposts/users/domain/user/vo/user-name';
import type { BetterAuthOptions, BetterAuthPlugin } from 'better-auth';
import { betterAuth } from 'better-auth';

import { APP_NAME } from '../../domain/auth/app-name';
import type { AuthConfig } from './config';
import { AuthExpirations } from './emails/auth-expirations';
import type { BetterAuthEmails } from './emails/better-auth-emails';
import type {
  BetterAuthCorePlugins,
  BetterAuthPluginsWith,
} from './plugins/registry';

export const AUTH_USER_MODEL = 'authUser';

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

  static readonly toConsole: BetterAuthLogWriter = (
    level,
    message,
    ...args
  ) => {
    const write = console[level === 'debug' ? 'log' : level] ?? console.log;
    write(`[better-auth] ${message}`, ...args);
  };
}

class SocialProviders {
  /** A provider is configured or it is absent — a half-filled pair is neither. */
  static of(config: AuthConfig): BetterAuthOptions['socialProviders'] {
    return {
      ...(config.googleClientId && config.googleClientSecret
        ? {
            google: {
              clientId: config.googleClientId,
              clientSecret: config.googleClientSecret,
            },
          }
        : {}),
      ...(config.githubClientId && config.githubClientSecret
        ? {
            github: {
              clientId: config.githubClientId,
              clientSecret: config.githubClientSecret,
            },
          }
        : {}),
    };
  }
}

export interface InitAuthOptions {
  readonly hooks?: BetterAuthOptions['hooks'];
  readonly logger?: BetterAuthOptions['logger'];
}

export class BetterAuthInstance {
  /**
   * Everything the instance is, but the database, the hooks and the logger — which is also what the
   * schema is generated from, so the emails are an argument here even where nothing will be sent.
   */
  static optionsFor<TPlugins extends readonly BetterAuthPlugin[]>(
    config: AuthConfig,
    plugins: TPlugins,
    emails: BetterAuthEmails,
  ) {
    return {
      appName: APP_NAME,
      secret: config.secret,
      baseURL: config.baseUrl,
      basePath: config.basePath,
      disabledPaths: ['/token'],
      user: {
        modelName: AUTH_USER_MODEL,
        changeEmail: {
          enabled: true,
          sendChangeEmailConfirmation: ({ user, newEmail, url }) =>
            emails.changeEmail({ user, newEmail, url }),
        },
        deleteUser: {
          enabled: true,
          deleteTokenExpiresIn: AuthExpirations.accountDeletionSeconds,
          sendDeleteAccountVerification: ({ user, url }) =>
            emails.deleteAccount({ user, url }),
        },
      },
      emailAndPassword: {
        enabled: true,
        autoSignIn: true,
        requireEmailVerification: config.requireEmailVerification,
        resetPasswordTokenExpiresIn: AuthExpirations.passwordResetSeconds,
        revokeSessionsOnPasswordReset: true,
        sendResetPassword: ({ user, url }) =>
          emails.resetPassword({ user, url }),
      },
      emailVerification: {
        sendOnSignUp: true,
        sendOnSignIn: true,
        autoSignInAfterVerification: true,
        expiresIn: AuthExpirations.emailVerificationSeconds,
        sendVerificationEmail: ({ user, url }) =>
          emails.verifyEmail({ user, url }),
      },
      account: {
        accountLinking: {
          enabled: true,
          trustedProviders: ['credential', 'google', 'github'],
        },
      },
      databaseHooks: {
        user: {
          create: {
            before: async (user) => ({
              data: {
                ...user,
                name: UserName.from(user.name, Email.parse(user.email)).value,
              },
            }),
          },
        },
      },
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
      rateLimit: config.rateLimit ? {} : { enabled: false },
      trustedOrigins: config.trustedOrigins,
    } satisfies BetterAuthOptions;
  }

  static create<TPlugins extends readonly BetterAuthPlugin[]>(
    config: AuthConfig,
    database: Database,
    plugins: TPlugins,
    emails: BetterAuthEmails,
    {
      hooks = {},
      logger = BetterAuthLogging.through(BetterAuthLogging.toConsole),
    }: InitAuthOptions = {},
  ) {
    return betterAuth({
      ...BetterAuthInstance.optionsFor(config, plugins, emails),
      database,
      hooks,
      logger,
    });
  }
}

export type BetterAuth = ReturnType<
  typeof BetterAuthInstance.create<BetterAuthCorePlugins>
>;

export type BetterAuthWith<TExtra extends readonly unknown[]> = ReturnType<
  typeof BetterAuthInstance.create<
    BetterAuthPluginsWith<TExtra> & readonly BetterAuthPlugin[]
  >
>;
