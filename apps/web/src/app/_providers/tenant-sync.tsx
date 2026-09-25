'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { OrganizationAuthClient } from '@better-auth-ui/core/plugins/organization';
import { useAuth, useSession } from '@better-auth-ui/react';
import { useActiveOrganization } from '@better-auth-ui/react/plugins/organization';
import { useQueryClient } from '@tanstack/react-query';

import { EVERY_GRAPH_QUERY } from '@/lib/graphql/gqlpc';
import { TenantHeader } from '@/lib/graphql/tenant';
import { getGraphCache } from '@/lib/query-client';

export function TenantSync({ children }: { children: React.ReactNode }) {
  const { authClient } = useAuth<OrganizationAuthClient>();
  const { data: session } = useSession(authClient);
  const { data: activeOrganization } = useActiveOrganization(authClient);
  const queryClient = useQueryClient();
  const router = useRouter();
  const activeId = session?.session.activeOrganizationId ?? null;
  const previous = useRef(activeId);

  TenantHeader.set(activeId ? (activeOrganization?.slug ?? null) : null);

  useEffect(() => {
    if (previous.current === activeId) {
      return;
    }
    previous.current = activeId;
    void getGraphCache().reset();
    void queryClient.resetQueries({ queryKey: EVERY_GRAPH_QUERY });
    router.refresh();
  }, [activeId, queryClient, router]);

  return children;
}
