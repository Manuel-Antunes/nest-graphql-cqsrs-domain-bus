import { Suspense } from 'react';
import { Skeleton } from '@nestposts/ui/components/ui/skeleton';

import { SagaRunner } from './_components/saga-runner';

export default function SagaPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-semibold text-2xl tracking-tight">Saga</h1>
        <p className="text-muted-foreground text-sm">
          Consistência eventual, cronometrada.
        </p>
      </div>
      <Suspense fallback={<Skeleton className="h-72 w-full" />}>
        <SagaRunner />
      </Suspense>
    </div>
  );
}
