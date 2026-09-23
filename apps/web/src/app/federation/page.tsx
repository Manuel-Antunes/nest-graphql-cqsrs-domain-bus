import { Suspense } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { PreloadQuery } from '@/lib/apollo/rsc';

import { EntitiesProbe } from './_components/entities-probe';
import { FederationSeedQuery } from './query';

export default function FederationPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Federação</h1>
        <p className="text-muted-foreground text-sm">
          Esta aplicação é um subgraph. Aqui a chamada que o roteador faria é
          feita direto.
        </p>
      </div>
      <PreloadQuery query={FederationSeedQuery} errorPolicy="all">
        <Suspense fallback={<Skeleton className="h-64 w-full" />}>
          <EntitiesProbe />
        </Suspense>
      </PreloadQuery>
    </div>
  );
}
