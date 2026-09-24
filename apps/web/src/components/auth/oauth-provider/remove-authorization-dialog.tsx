'use client';

import { useState } from 'react';
import type {
  AuthorizedOAuthApplication,
  OAuthProviderAuthClient,
} from '@better-auth-ui/core/plugins/oauth-provider';
import { useAuth, useAuthPlugin } from '@better-auth-ui/react';
import { useDeleteOAuthConsent } from '@better-auth-ui/react/plugins/oauth-provider';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@nestposts/ui/components/ui/alert-dialog';
import { Button } from '@nestposts/ui/components/ui/button';
import { Spinner } from '@nestposts/ui/components/ui/spinner';
import { ShieldOff } from 'lucide-react';

import { oauthProviderPlugin } from '@/lib/auth/oauth-provider-plugin';

export type RemoveAuthorizationDialogProps = {
  application: AuthorizedOAuthApplication;
  clientName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function RemoveAuthorizationDialog({
  application,
  clientName,
  open,
  onOpenChange,
}: RemoveAuthorizationDialogProps) {
  const { authClient, localization } = useAuth();
  const { localization: oauthLocalization } =
    useAuthPlugin(oauthProviderPlugin);
  const [isRemoving, setIsRemoving] = useState(false);

  const { mutateAsync: deleteConsent } = useDeleteOAuthConsent(
    authClient as OAuthProviderAuthClient,
  );

  const removeAuthorization = async () => {
    setIsRemoving(true);

    try {
      for (const id of application.consentIds) {
        await deleteConsent({ id });
      }

      onOpenChange(false);
    } catch {
    } finally {
      setIsRemoving(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia>
            <ShieldOff />
          </AlertDialogMedia>

          <AlertDialogTitle>
            {oauthLocalization.removeAuthorizationTitle}
          </AlertDialogTitle>

          <AlertDialogDescription>
            {oauthLocalization.removeAuthorizationDescription}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <p className="font-medium text-sm">{clientName}</p>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isRemoving}>
            {localization.settings.cancel}
          </AlertDialogCancel>

          <Button
            type="button"
            variant="destructive"
            disabled={isRemoving}
            onClick={removeAuthorization}
          >
            {isRemoving && <Spinner />}

            {oauthLocalization.remove}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
