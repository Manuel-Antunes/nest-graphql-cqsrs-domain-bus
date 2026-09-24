'use client';

import type {
  ListDeviceSession,
  MultiSessionAuthClient,
} from '@better-auth-ui/core/plugins/multi-session';
import { useAuth, useAuthPlugin, useSession } from '@better-auth-ui/react';
import {
  useRevokeMultiSession,
  useSetActiveSession,
} from '@better-auth-ui/react/plugins/multi-session';
import { Button, buttonVariants } from '@nestposts/ui/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@nestposts/ui/components/ui/dropdown-menu';
import { Item, ItemActions } from '@nestposts/ui/components/ui/item';
import { Spinner } from '@nestposts/ui/components/ui/spinner';
import { ArrowLeftRight, LogOut, MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';

import { UserView } from '@/components/auth/user/user-view';
import { multiSessionPlugin } from '@/lib/auth/multi-session-plugin';
import { cn } from '@/lib/utils';

export type ManageAccountProps = {
  deviceSession?: ListDeviceSession | null;
  isPending?: boolean;
};

export function ManageAccount({
  deviceSession,
  isPending,
}: ManageAccountProps) {
  const { authClient, localization } = useAuth<MultiSessionAuthClient>();
  const { localization: multiSessionLocalization } =
    useAuthPlugin(multiSessionPlugin);
  const { data: session } = useSession(authClient);

  const { mutate: setActiveSession, isPending: isSwitching } =
    useSetActiveSession(authClient, {
      onSuccess: () => window.scrollTo({ top: 0 }),
    });

  const { mutate: revokeSession, isPending: isRevoking } =
    useRevokeMultiSession(authClient, {
      onSuccess: () =>
        toast.success(localization.settings.revokeSessionSuccess),
    });

  const isActive = deviceSession?.session.userId === session?.session.userId;
  const isBusy = isSwitching || isRevoking;

  return (
    <Item>
      <UserView
        className="flex-1"
        user={deviceSession?.user}
        isPending={isPending}
      />
      <ItemActions>
        {deviceSession && isActive && (
          <Button
            className="shrink-0"
            variant="outline"
            size="sm"
            onClick={() =>
              revokeSession({ sessionToken: deviceSession.session.token })
            }
            disabled={isBusy}
          >
            {isRevoking ? <Spinner /> : <LogOut />}
            {localization.auth.signOut}
          </Button>
        )}

        {deviceSession && !isActive && (
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                buttonVariants({ variant: 'ghost', size: 'icon-sm' }),
                'shrink-0',
              )}
              disabled={isBusy}
            >
              <MoreHorizontal />
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="min-w-fit">
              <DropdownMenuItem
                onClick={() =>
                  setActiveSession({
                    sessionToken: deviceSession.session.token,
                  })
                }
              >
                <ArrowLeftRight className="text-muted-foreground" />
                {multiSessionLocalization.switchAccount}
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() =>
                  revokeSession({
                    sessionToken: deviceSession.session.token,
                  })
                }
              >
                <LogOut className="text-muted-foreground" />
                {localization.auth.signOut}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </ItemActions>
    </Item>
  );
}
