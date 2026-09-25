import { Suspense } from 'react';
import { Skeleton } from '@nestposts/ui/components/ui/skeleton';

import { QueryErrorBoundary } from '@/app/_components/query-error-boundary';
import { PrefetchQuery } from '@/lib/graphql/prefetch';

import { PostView } from './_components/post-view';
import { postByIdOptions } from './query';

export default async function PostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <Suspense fallback={<Skeleton className="h-72 w-full" />}>
      <PrefetchQuery options={postByIdOptions(id)}>
        <QueryErrorBoundary title="Não foi possível ler o post">
          <PostView id={id} />
        </QueryErrorBoundary>
      </PrefetchQuery>
    </Suspense>
  );
}
