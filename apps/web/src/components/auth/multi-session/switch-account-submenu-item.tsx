'use client';

import type {
  ListDeviceSession,
  MultiSessionAuthClient,
} from '@better-auth-ui/core/plugins/multi-session';
import { useAuth } from '@better-auth-ui/react';
import { useSetActiveSession } from '@better-auth-ui/react/plugins/multi-session';
import { DropdownMenuItem } from '@nestposts/ui/components/ui/dropdown-menu';
import { Spinner } from '@nestposts/ui/components/ui/spinner';

import { UserView } from '@/components/auth/user/user-view';

export type SwitchAccountSubmenuItemProps = {
  deviceSession: ListDeviceSession;
};

export function SwitchAccountSubmenuItem({
  deviceSession,
}: SwitchAccountSubmenuItemProps) {
  const { authClient } = useAuth<MultiSessionAuthClient>();
  const { mutate: setActiveSession, isPending } = useSetActiveSession(
    authClient,
    {
      onSuccess: () => window.scrollTo({ top: 0 }),
    },
  );

  return (
    <DropdownMenuItem
      disabled={isPending}
      onClick={() =>
        setActiveSession({ sessionToken: deviceSession.session.token })
      }
    >
      <UserView user={deviceSession.user} />

      {isPending && <Spinner className="ml-auto size-4" />}
    </DropdownMenuItem>
  );
}
