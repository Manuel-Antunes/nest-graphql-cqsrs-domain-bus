'use client';

import { oauthProviderClient } from '@better-auth/oauth-provider/client';
import {
  adminClient,
  emailOTPClient,
  magicLinkClient,
  multiSessionClient,
  organizationClient,
  twoFactorClient,
} from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  plugins: [
    organizationClient({ teams: { enabled: true } }),
    adminClient(),
    magicLinkClient(),
    emailOTPClient(),
    twoFactorClient(),
    multiSessionClient(),
    oauthProviderClient(),
  ],
});
