'use client';

import { Fragment } from 'react';
import type { MultiSessionAuthClient } from '@better-auth-ui/core/plugins/multi-session';
import { useAuth, useAuthPlugin, useSession } from '@better-auth-ui/react';
import { useListDeviceSessions } from '@better-auth-ui/react/plugins/multi-session';
import { Card, CardContent } from '@nestposts/ui/components/ui/card';
import { ItemGroup, ItemSeparator } from '@nestposts/ui/components/ui/item';

import { multiSessionPlugin } from '@/lib/auth/multi-session-plugin';
import { cn } from '@/lib/utils';

import { ManageAccount } from './manage-account';

export type ManageAccountsProps = {
  className?: string;
};

export function ManageAccounts({ className }: ManageAccountsProps) {
  const { authClient } = useAuth<MultiSessionAuthClient>();
  const { localization: multiSessionLocalization } =
    useAuthPlugin(multiSessionPlugin);
  const { data: session } = useSession(authClient);

  const { data: deviceSessions, isPending } = useListDeviceSessions(authClient);

  const otherSessions = deviceSessions?.filter(
    (deviceSession) => deviceSession.session.id !== session?.session.id,
  );

  const allRows = [
    {
      key: session?.session.id ?? 'current',
      deviceSession: !isPending ? session : null,
      isPending,
    },
    ...(otherSessions?.map((deviceSession) => ({
      key: deviceSession.session.id,
      deviceSession,
      isPending: false,
    })) ?? []),
  ];

  return (
    <div>
      <h2 className="mb-3 font-semibold text-sm">
        {multiSessionLocalization.manageAccounts}
      </h2>

      <Card className={cn('p-0', className)}>
        <CardContent className="p-0">
          <ItemGroup className="gap-0">
            {allRows.map((row, index) => (
              <Fragment key={row.key}>
                {index > 0 && <ItemSeparator />}
                <ManageAccount
                  deviceSession={row.deviceSession}
                  isPending={row.isPending}
                />
              </Fragment>
            ))}
          </ItemGroup>
        </CardContent>
      </Card>
    </div>
  );
}
