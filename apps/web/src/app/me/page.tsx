import { Suspense } from 'react';
import { Skeleton } from '@nestposts/ui/components/ui/skeleton';

import { WebAuth } from '@/lib/auth/server';
import { PrefetchQuery } from '@/lib/graphql/prefetch';

import { IdentityPanel } from './_components/identity-panel';
import { meOptions } from './query';

export default async function MePage() {
  const session = await WebAuth.session();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Identidade</h1>
        <p className="text-muted-foreground text-sm">
          Nenhum usuário é cadastrado nesta aplicação: o perfil nasce na
          primeira requisição com um token novo, ou se liga a um existente pelo
          e-mail.
        </p>
      </div>
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        {session ? (
          <PrefetchQuery options={meOptions()}>
            <IdentityPanel />
          </PrefetchQuery>
        ) : (
          <IdentityPanel />
        )}
      </Suspense>
    </div>
  );
}
