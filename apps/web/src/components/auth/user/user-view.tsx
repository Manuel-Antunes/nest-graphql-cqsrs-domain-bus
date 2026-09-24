'use client';

import type { UsernameAuthClient } from '@better-auth-ui/core/plugins/username';
import { useAuth, useSession } from '@better-auth-ui/react';
import { Skeleton } from '@nestposts/ui/components/ui/skeleton';
import type { User } from 'better-auth';

import { cn } from '@/lib/utils';

import { UserAvatar } from './user-avatar';

export type UserViewProps = {
  className?: string;
  isPending?: boolean;
  hideSubtitle?: boolean;
  user?: Partial<User> & {
    username?: string | null;
    displayUsername?: string | null;
  };
};

export function UserView({
  className,
  isPending,
  hideSubtitle = false,
  user,
}: UserViewProps) {
  const { authClient } = useAuth<UsernameAuthClient>();
  const { data: session, isPending: sessionPending } = useSession(authClient, {
    enabled: !user && !isPending,
  });

  const resolvedUser = user ?? session?.user;

  if ((isPending || sessionPending) && !user) {
    return (
      <div className={cn('flex min-w-0 items-center gap-2', className)}>
        <UserAvatar isPending />

        <div className="grid flex-1 gap-1 text-left text-sm">
          <Skeleton className="h-4 w-24" />

          {!hideSubtitle && <Skeleton className="h-3 w-32" />}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex min-w-0 items-center gap-2', className)}>
      <UserAvatar user={resolvedUser as User | undefined} />

      <div className="grid min-w-0 flex-1 text-left text-sm leading-tight">
        <span className="truncate font-medium text-foreground">
          {resolvedUser?.displayUsername ||
            resolvedUser?.name ||
            resolvedUser?.email}
        </span>

        {!hideSubtitle &&
          (resolvedUser?.displayUsername || resolvedUser?.name) && (
            <span className="truncate text-muted-foreground text-xs">
              {resolvedUser?.email}
            </span>
          )}
      </div>
    </div>
  );
}
