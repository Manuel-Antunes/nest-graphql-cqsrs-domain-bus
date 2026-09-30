import { Suspense } from 'react';
import Link from 'next/link';
import { CLIENT_RESOURCE } from '@nestposts/organizations/infrastructure/better-auth/access';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@nestposts/ui/components/ui/alert';
import { Skeleton } from '@nestposts/ui/components/ui/skeleton';
import { Building2Icon, UsersRoundIcon } from 'lucide-react';

import { QueryErrorBoundary } from '@/app/_components/query-error-boundary';
import { WebAuth } from '@/lib/auth/server';
import { PrefetchQuery } from '@/lib/graphql/prefetch';

import { ClientsView } from './_components/clients-view';
import { clientsOptions } from './query';

const CLIENTS_PATH = '/clients';

export default async function ClientsPage() {
  const [identity, canRead, canCreate, canUpdate, canDelete] =
    await Promise.all([
      WebAuth.identity(),
      WebAuth.hasOrgPermission({ [CLIENT_RESOURCE]: ['read'] }),
      WebAuth.hasOrgPermission({ [CLIENT_RESOURCE]: ['create'] }),
      WebAuth.hasOrgPermission({ [CLIENT_RESOURCE]: ['update'] }),
      WebAuth.hasOrgPermission({ [CLIENT_RESOURCE]: ['delete'] }),
    ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Clients</h1>
        <p className="text-muted-foreground text-sm">
          The people the active organization represents, each with the Chatwoot
          contacts they are reached through.
        </p>
      </div>

      {!identity ? (
        <Alert>
          <UsersRoundIcon />
          <AlertTitle>Sign in to see the clients</AlertTitle>
          <AlertDescription>
            <Link
              href={`/auth/sign-in?redirectTo=${CLIENTS_PATH}`}
              className="underline"
            >
              Go to sign in
            </Link>
          </AlertDescription>
        </Alert>
      ) : !canRead ? (
        <Alert>
          <Building2Icon />
          <AlertTitle>Clients belong to an organization</AlertTitle>
          <AlertDescription>
            Pick, in the header, an organization you are a member of.
          </AlertDescription>
        </Alert>
      ) : (
        <Suspense fallback={<Skeleton className="h-96 w-full" />}>
          <PrefetchQuery options={clientsOptions()}>
            <QueryErrorBoundary title="Could not list the clients">
              <ClientsView permissions={{ canCreate, canUpdate, canDelete }} />
            </QueryErrorBoundary>
          </PrefetchQuery>
        </Suspense>
      )}
    </div>
  );
}
