'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
} from 'react';
import { authQueryKeys } from '@better-auth-ui/core';
import { useSession as useAuthSession } from '@better-auth-ui/react';
import { matchQuery, useQueryClient } from '@tanstack/react-query';

import type { Session } from '@/lib/auth/session';
import { isAuthor as hasAuthorRole } from '@/lib/auth/session';
import { authClient } from '@/lib/auth-client';

interface SessionContextValue {
  session: Session | null;
  isAuthor: boolean;
  renew: () => Promise<Session | null>;
}

type AuthSession = ReturnType<typeof useAuthSession<typeof authClient>>['data'];

const SessionContext = createContext<SessionContextValue>({
  session: null,
  isAuthor: false,
  renew: async () => null,
});

const sessionOf = (data: AuthSession): Session | null =>
  data
    ? {
        expiresAt: new Date(data.session.expiresAt).getTime(),
        activeOrganizationId:
          (data.session as { activeOrganizationId?: string | null })
            .activeOrganizationId ?? null,
        user: {
          id: data.user.id,
          email: data.user.email,
          name: data.user.name,
          role: (data.user as { role?: string | null }).role ?? null,
        },
      }
    : null;

function useRenderOnSessionRemoval() {
  const queryClient = useQueryClient();
  const [, render] = useReducer((renders: number) => renders + 1, 0);

  useEffect(
    () =>
      queryClient.getQueryCache().subscribe((event) => {
        if (
          event.type === 'removed' &&
          matchQuery({ queryKey: authQueryKeys.session }, event.query)
        ) {
          render();
        }
      }),
    [queryClient],
  );
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  useRenderOnSessionRemoval();
  const { data, refetch } = useAuthSession(authClient);
  const session = sessionOf(data);

  const renew = useCallback(
    async () => sessionOf((await refetch()).data),
    [refetch],
  );

  const value = useMemo(
    () => ({ session, isAuthor: hasAuthorRole(session), renew }),
    [session, renew],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  return useContext(SessionContext);
}
