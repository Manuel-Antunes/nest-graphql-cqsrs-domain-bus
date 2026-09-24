'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useApolloClient } from '@apollo/client/react';
import type { OrganizationAuthClient } from '@better-auth-ui/core/plugins/organization';
import { useAuth, useSession } from '@better-auth-ui/react';
import { useActiveOrganization } from '@better-auth-ui/react/plugins/organization';

import { TenantHeader } from '@/lib/apollo/tenant';

export function TenantSync({ children }: { children: React.ReactNode }) {
  const { authClient } = useAuth<OrganizationAuthClient>();
  const { data: session } = useSession(authClient);
  const { data: activeOrganization } = useActiveOrganization(authClient);
  const client = useApolloClient();
  const router = useRouter();
  const activeId = session?.session.activeOrganizationId ?? null;
  const previous = useRef(activeId);

  TenantHeader.set(activeId ? (activeOrganization?.slug ?? null) : null);

  useEffect(() => {
    if (previous.current === activeId) {
      return;
    }
    previous.current = activeId;
    void client.resetStore();
    router.refresh();
  }, [activeId, client, router]);

  return children;
}
