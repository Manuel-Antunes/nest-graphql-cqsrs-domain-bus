'use client';

import type { ReactNode } from 'react';
import type { UsernameAuthClient } from '@better-auth-ui/core/plugins/username';
import { useAuth, useSession } from '@better-auth-ui/react';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@nestposts/ui/components/ui/avatar';
import { Skeleton } from '@nestposts/ui/components/ui/skeleton';
import type { User } from 'better-auth';
import { User2 } from 'lucide-react';

import { cn } from '@/lib/utils';

export type UserAvatarProps = {
  className?: string;
  fallback?: ReactNode;
  isPending?: boolean;
  user?: User & { username?: string | null; displayUsername?: string | null };
};

export function UserAvatar({
  className,
  user,
  isPending,
  fallback,
}: UserAvatarProps) {
  const { authClient } = useAuth<UsernameAuthClient>();
  const { data: session, isPending: sessionPending } = useSession(authClient, {
    enabled: !user && !isPending,
  });

  if ((isPending || sessionPending) && !user) {
    return <Skeleton className={cn('size-8 rounded-full', className)} />;
  }

  const resolvedUser = user ?? session?.user;

  const initials = (
    resolvedUser?.username ||
    resolvedUser?.name ||
    resolvedUser?.email
  )
    ?.slice(0, 2)
    .toUpperCase();

  return (
    <Avatar
      className={cn(
        'size-8 rounded-full bg-muted text-foreground text-sm',
        className,
      )}
    >
      <AvatarImage
        src={resolvedUser?.image ?? undefined}
        alt={
          resolvedUser?.displayUsername ||
          resolvedUser?.name ||
          resolvedUser?.email
        }
      />

      <AvatarFallback className="text-muted-foreground!">
        {fallback || initials || <User2 className="size-4" />}
      </AvatarFallback>
    </Avatar>
  );
}
