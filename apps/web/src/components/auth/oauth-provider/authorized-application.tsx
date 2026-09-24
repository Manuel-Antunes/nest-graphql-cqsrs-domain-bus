'use client';

import { useState } from 'react';
import type { OAuthProviderAuthClient } from '@better-auth-ui/core/plugins/oauth-provider';
import {
  type AuthorizedOAuthApplication,
  resolveOAuthScopeMetadata,
  sanitizeOAuthClientUrl,
} from '@better-auth-ui/core/plugins/oauth-provider';
import { useAuth, useAuthPlugin } from '@better-auth-ui/react';
import { usePublicOAuthClient } from '@better-auth-ui/react/plugins/oauth-provider';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@nestposts/ui/components/ui/avatar';
import { Badge } from '@nestposts/ui/components/ui/badge';
import { Button } from '@nestposts/ui/components/ui/button';
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemMedia,
  ItemTitle,
} from '@nestposts/ui/components/ui/item';
import { Skeleton } from '@nestposts/ui/components/ui/skeleton';
import { ShieldCheck } from 'lucide-react';

import { oauthProviderPlugin } from '@/lib/auth/oauth-provider-plugin';

import { RemoveAuthorizationDialog } from './remove-authorization-dialog';

export type AuthorizedApplicationProps = {
  application: AuthorizedOAuthApplication;
};

export function AuthorizedApplication({
  application,
}: AuthorizedApplicationProps) {
  const { authClient } = useAuth();
  const { localization, scopeMetadata } = useAuthPlugin(oauthProviderPlugin);
  const [removeOpen, setRemoveOpen] = useState(false);

  const publicClient = usePublicOAuthClient(
    authClient as OAuthProviderAuthClient,
    application.clientId,
  );

  const client = publicClient.data;
  const clientName = client?.client_name || application.clientId;
  const logoUrl = sanitizeOAuthClientUrl(client?.logo_uri);
  const websiteUrl = sanitizeOAuthClientUrl(client?.client_uri);

  return (
    <Item>
      <ItemMedia variant="image">
        {publicClient.isPending ? (
          <Skeleton className="size-10 shrink-0 rounded-md" />
        ) : (
          <Avatar className="size-10 shrink-0 rounded-md">
            <AvatarImage
              alt={clientName}
              referrerPolicy="no-referrer"
              src={logoUrl}
            />
            <AvatarFallback className="rounded-md">
              <ShieldCheck className="size-4.5" />
            </AvatarFallback>
          </Avatar>
        )}
      </ItemMedia>
      <ItemContent>
        {publicClient.isPending ? (
          <Skeleton className="h-4 w-32" />
        ) : (
          <ItemTitle>{clientName}</ItemTitle>
        )}

        {websiteUrl ? (
          <ItemDescription>
            <a
              className="truncate text-muted-foreground text-xs underline-offset-4 hover:underline"
              href={websiteUrl}
              rel="noreferrer"
              target="_blank"
            >
              {websiteUrl}
            </a>
          </ItemDescription>
        ) : null}

        {application.updatedAt ? (
          <ItemDescription>
            {`${localization.lastAuthorized} ${application.updatedAt.toLocaleDateString(
              undefined,
              { dateStyle: 'medium' },
            )}`}
          </ItemDescription>
        ) : null}

        {application.scopes.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {application.scopes.map((scope) => (
              <Badge key={scope} variant="secondary">
                {
                  resolveOAuthScopeMetadata(scopeMetadata, scope, {
                    clientId: application.clientId,
                    requestedScopes: application.scopes,
                  }).label
                }
              </Badge>
            ))}
          </div>
        )}
      </ItemContent>
      <ItemActions>
        <Button size="sm" variant="outline" onClick={() => setRemoveOpen(true)}>
          {localization.removeAuthorization}
        </Button>

        <RemoveAuthorizationDialog
          application={application}
          clientName={clientName}
          open={removeOpen}
          onOpenChange={setRemoveOpen}
        />
      </ItemActions>
    </Item>
  );
}
