import type { FactoryProvider } from '@nestjs/common';
import { magicLink } from 'better-auth/plugins';

import { AuthExpirations } from '../emails/auth-expirations';
import { BetterAuthEmails } from '../emails/better-auth-emails';
import { MAGIC_LINK_BETTER_AUTH_PLUGIN } from './tokens';

export const MagicLinkBetterAuthPluginProvider = {
  provide: MAGIC_LINK_BETTER_AUTH_PLUGIN,
  useFactory: (emails: BetterAuthEmails) =>
    magicLink({
      expiresIn: AuthExpirations.magicLinkSeconds,
      storeToken: 'hashed',
      sendMagicLink: ({ email, url }) => emails.magicLink({ email, url }),
    }),
  inject: [BetterAuthEmails],
} satisfies FactoryProvider;
