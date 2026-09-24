'use client';

import type { ComponentProps } from 'react';
import type { OrganizationAuthClient } from '@better-auth-ui/core/plugins/organization';
import { useAuth } from '@better-auth-ui/react';
import { useHasPermission } from '@better-auth-ui/react/plugins/organization';
import { Card, CardContent } from '@nestposts/ui/components/ui/card';
import { Separator } from '@nestposts/ui/components/ui/separator';

import { cn } from '@/lib/utils';

import { DeleteOrganization } from './delete-organization';
import { DeleteOrganizationSkeleton } from './delete-organization-skeleton';
import { LeaveOrganization } from './leave-organization';

export type OrganizationDangerZoneProps = {
  className?: string;
};

export function OrganizationDangerZone({
  className,
  ...props
}: OrganizationDangerZoneProps & ComponentProps<'div'>) {
  const { authClient, localization } = useAuth<OrganizationAuthClient>();

  const { data: deletePermission, isPending: deletePermissionPending } =
    useHasPermission(authClient, {
      permissions: { organization: ['delete'] },
    });

  const canDelete = !!deletePermission?.success;

  return (
    <div className={cn('flex w-full flex-col', className)} {...props}>
      <h2 className="mb-3 font-semibold text-destructive text-sm">
        {localization.settings.dangerZone}
      </h2>

      <Card>
        <CardContent>
          {deletePermissionPending ? (
            <DeleteOrganizationSkeleton />
          ) : (
            <>
              <LeaveOrganization />

              {canDelete && (
                <>
                  <Separator className="my-4" />

                  <DeleteOrganization />
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
