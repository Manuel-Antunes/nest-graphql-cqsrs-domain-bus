import type { AuthSocialProvider } from '@better-auth-ui/core';
import type { DehydratedState } from '@tanstack/react-query';

import { ApolloProvider } from './apollo-provider';
import { AuthProviders } from './auth-providers';
import { SessionProvider } from './session-provider';
import { TenantSync } from './tenant-sync';

export function Providers({
  socialProviders,
  dehydratedState,
  children,
}: {
  socialProviders: AuthSocialProvider[];
  dehydratedState: DehydratedState;
  children: React.ReactNode;
}) {
  return (
    <AuthProviders
      socialProviders={socialProviders}
      dehydratedState={dehydratedState}
    >
      <SessionProvider>
        <ApolloProvider>
          <TenantSync>{children}</TenantSync>
        </ApolloProvider>
      </SessionProvider>
    </AuthProviders>
  );
}
