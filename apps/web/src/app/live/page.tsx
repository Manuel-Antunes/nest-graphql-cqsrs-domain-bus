import { Suspense } from 'react';
import { Skeleton } from '@nestposts/ui/components/ui/skeleton';

import { PrefetchQuery } from '@/lib/graphql/prefetch';

import { LiveConsole } from './_components/live-console';
import { recentPostsOptions } from './query';

export default function LivePage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Tempo real</h1>
        <p className="text-muted-foreground text-sm">
          O que atravessa, o que não atravessa, e por quê.
        </p>
      </div>
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <PrefetchQuery options={recentPostsOptions()}>
          <LiveConsole />
        </PrefetchQuery>
      </Suspense>
    </div>
  );
}
