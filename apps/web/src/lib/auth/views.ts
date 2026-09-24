import { viewPaths } from '@better-auth-ui/core';
import { emailOtpPlugin } from '@better-auth-ui/core/plugins/email-otp';
import { magicLinkPlugin } from '@better-auth-ui/core/plugins/magic-link';
import { oauthProviderPlugin } from '@better-auth-ui/core/plugins/oauth-provider';
import { organizationPlugin } from '@better-auth-ui/core/plugins/organization';
import { twoFactorPlugin } from '@better-auth-ui/core/plugins/two-factor';

const plugins = [
  magicLinkPlugin(),
  emailOtpPlugin({ signIn: true }),
  twoFactorPlugin(),
  organizationPlugin({ teams: true }),
  oauthProviderPlugin({ clientManagement: true }),
];

const segmentsOf = (paths: object | undefined): string[] =>
  Object.values(paths ?? {}).filter(
    (segment): segment is string => typeof segment === 'string',
  );

const pathsOf = (
  section: 'auth' | 'settings',
  own: object,
): ReadonlySet<string> =>
  new Set([
    ...segmentsOf(own),
    ...plugins.flatMap((plugin) =>
      segmentsOf(
        (plugin.viewPaths as Record<string, object> | undefined)?.[section],
      ),
    ),
  ]);

export const AUTH_VIEW_PATHS = pathsOf('auth', viewPaths.auth);

export const SETTINGS_VIEW_PATHS = pathsOf('settings', viewPaths.settings);

export const ORGANIZATION_VIEW_PATHS: ReadonlySet<string> = new Set(
  segmentsOf(organizationPlugin({ teams: true }).viewPaths?.organization),
);

export const signInFor = (path: string): string =>
  `/auth/sign-in?redirectTo=${encodeURIComponent(path)}`;
