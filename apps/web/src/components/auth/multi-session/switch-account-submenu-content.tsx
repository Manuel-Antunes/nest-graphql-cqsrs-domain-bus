'use client';

import type { MultiSessionAuthClient } from '@better-auth-ui/core/plugins/multi-session';
import { useAuth, useAuthPlugin, useSession } from '@better-auth-ui/react';
import { useListDeviceSessions } from '@better-auth-ui/react/plugins/multi-session';
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSubContent,
} from '@nestposts/ui/components/ui/dropdown-menu';
import { Check, CirclePlus } from 'lucide-react';

import { UserView } from '@/components/auth/user/user-view';
import { multiSessionPlugin } from '@/lib/auth/multi-session-plugin';

import { SwitchAccountSubmenuItem } from './switch-account-submenu-item';

export function SwitchAccountSubmenuContent() {
  const { authClient, basePaths, viewPaths, navigate } =
    useAuth<MultiSessionAuthClient>();
  const { localization: multiSessionLocalization } =
    useAuthPlugin(multiSessionPlugin);
  const { data: session } = useSession(authClient);
  const { data: deviceSessions, isPending } = useListDeviceSessions(authClient);

  return (
    <DropdownMenuSubContent className="min-w-48 max-w-[48svw] md:min-w-56">
      <DropdownMenuItem>
        <UserView isPending={isPending} />

        {!isPending && <Check className="ml-auto" />}
      </DropdownMenuItem>

      {deviceSessions
        ?.filter(
          (deviceSession) => deviceSession.session.id !== session?.session.id,
        )
        .map((deviceSession) => (
          <SwitchAccountSubmenuItem
            key={deviceSession.session.id}
            deviceSession={deviceSession}
          />
        ))}

      <DropdownMenuSeparator />

      <DropdownMenuItem
        onClick={() =>
          navigate({ to: `${basePaths.auth}/${viewPaths.auth.signIn}` })
        }
      >
        <CirclePlus className="text-muted-foreground" />

        {multiSessionLocalization.addAccount}
      </DropdownMenuItem>
    </DropdownMenuSubContent>
  );
}
