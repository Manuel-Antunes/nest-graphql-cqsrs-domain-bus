import type { AuthSocialProvider } from '@better-auth-ui/core';
import type { DehydratedState } from '@tanstack/react-query';

import { AuthProviders } from './auth-providers';
import { SessionProvider } from './session-provider';
import { TenantSync } from './tenant-sync';

export function Providers({
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
  return (
    <AuthProviders
      socialProviders={socialProviders}
      billing={billing}
      dehydratedState={dehydratedState}
    >
      <SessionProvider>
        <TenantSync>{children}</TenantSync>
      </SessionProvider>
    </AuthProviders>
  );
}
