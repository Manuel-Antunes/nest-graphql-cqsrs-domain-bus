import { Suspense } from 'react';

import { QueryErrorBoundary } from '@/app/_components/query-error-boundary';
import { PrefetchInfiniteQuery } from '@/lib/graphql/prefetch';

import { FeedSkeleton } from './_components/feed-skeleton';
import { FeedView } from './_components/feed-view';
import { feedPostsOptions } from './query';

export default function FeedPage() {
  return (
    <Suspense fallback={<FeedSkeleton />}>
      <PrefetchInfiniteQuery options={feedPostsOptions()}>
        <QueryErrorBoundary title="Não foi possível listar os posts">
          <FeedView />
        </QueryErrorBoundary>
      </PrefetchInfiniteQuery>
    </Suspense>
  );
}
