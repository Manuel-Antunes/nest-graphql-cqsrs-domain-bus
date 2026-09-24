'use client';

import { useState } from 'react';
import type { OrganizationAuthClient } from '@better-auth-ui/core/plugins/organization';
import { useAuth, useAuthPlugin } from '@better-auth-ui/react';
import {
  useActiveOrganization,
  useHasPermission,
} from '@better-auth-ui/react/plugins/organization';
import { Button } from '@nestposts/ui/components/ui/button';

import { organizationPlugin } from '@/lib/auth/organization-plugin';

import { DeleteOrganizationDialog } from './delete-organization-dialog';
import { DeleteOrganizationSkeleton } from './delete-organization-skeleton';

export function DeleteOrganization() {
  const { authClient } = useAuth<OrganizationAuthClient>();
  const { localization: organizationLocalization } =
    useAuthPlugin(organizationPlugin);

  const { data: activeOrganization } = useActiveOrganization(authClient);

  const { data: permission, isPending: permissionPending } = useHasPermission(
    authClient,
    {
      permissions: { organization: ['delete'] },
    },
  );

  const [confirmOpen, setConfirmOpen] = useState(false);

  if (permissionPending) {
    return <DeleteOrganizationSkeleton />;
  }

  if (!permission?.success) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium text-sm leading-tight">
          {organizationLocalization.deleteOrganization}
        </p>

        <p className="mt-0.5 text-muted-foreground text-xs">
          {organizationLocalization.deleteOrganizationDescription}
        </p>
      </div>

      <Button
        disabled={!activeOrganization}
        size="sm"
        variant="outline"
        className="text-destructive"
        onClick={() => setConfirmOpen(true)}
      >
        {organizationLocalization.deleteOrganization}
      </Button>

      {activeOrganization && (
        <DeleteOrganizationDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          organization={activeOrganization}
        />
      )}
    </div>
  );
}
