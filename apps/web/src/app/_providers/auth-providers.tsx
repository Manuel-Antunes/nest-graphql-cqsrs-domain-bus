'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { AuthSocialProvider } from '@better-auth-ui/core';
import { TooltipProvider } from '@nestposts/ui/components/ui/tooltip';
import type { DehydratedState } from '@tanstack/react-query';
import { HydrationBoundary, QueryClientProvider } from '@tanstack/react-query';

import { AuthProvider } from '@/components/auth/auth-provider';
import { adminPlugin } from '@/lib/auth/admin-plugin';
import { billingAdapter } from '@/lib/auth/billing-adapter';
import { billingPlugin } from '@/lib/auth/billing-plugin';
import { deleteUserPlugin } from '@/lib/auth/delete-user-plugin';
import { emailOtpPlugin } from '@/lib/auth/email-otp-plugin';
import { magicLinkPlugin } from '@/lib/auth/magic-link-plugin';
import { multiSessionPlugin } from '@/lib/auth/multi-session-plugin';
import { oauthProviderPlugin } from '@/lib/auth/oauth-provider-plugin';
import { organizationPlugin } from '@/lib/auth/organization-plugin';
import { SYSTEM_ROLES } from '@/lib/auth/roles';
import { twoFactorPlugin } from '@/lib/auth/two-factor-plugin';
import { BILLING_SETTINGS_PATH } from '@/lib/auth/views';
import { authClient } from '@/lib/auth-client';
import { getQueryClient } from '@/lib/query-client';

export const AFTER_SIGN_IN = '/feed';

const plugins = [
  magicLinkPlugin(),
  emailOtpPlugin({ signIn: true }),
  twoFactorPlugin(),
  multiSessionPlugin(),
  deleteUserPlugin({ sendDeleteAccountVerification: true }),
  organizationPlugin({ teams: true, logo: { enabled: false } }),
  adminPlugin({ roles: SYSTEM_ROLES, defaultRole: 'user' }),
  oauthProviderPlugin({
    clientManagement: true,
    scopeMetadata: {
      'read:posts': { label: 'Read your posts' },
      'write:posts': { label: 'Write posts on your behalf' },
    },
  }),
];

const pluginsWithBilling = [
  ...plugins,
  billingPlugin({
    adapter: billingAdapter,
    user: true,
    organization: false,
    path: BILLING_SETTINGS_PATH,
  }),
];

export function AuthProviders({
  socialProviders,
  billing,
  dehydratedState,
  children,
}: {
  socialProviders: AuthSocialProvider[];
  billing: boolean;
  dehydratedState: DehydratedState;
  children: React.ReactNode;
}) {
  const router = useRouter();

  return (
    <QueryClientProvider client={getQueryClient()}>
      <AuthProvider
        authClient={authClient}
        redirectTo={AFTER_SIGN_IN}
        socialProviders={socialProviders}
        emailAndPassword={{ requireEmailVerification: true }}
        avatar={{ enabled: false }}
        navigate={({ to, replace }) =>
          replace ? router.replace(to) : router.push(to)
        }
        plugins={billing ? pluginsWithBilling : plugins}
        Link={Link}
      >
        <HydrationBoundary state={dehydratedState}>
          <TooltipProvider>{children}</TooltipProvider>
        </HydrationBoundary>
      </AuthProvider>
    </QueryClientProvider>
  );
}
