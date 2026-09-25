'use client';

import { Button } from '@nestposts/ui/components/ui/button';
import { FileTextIcon, Loader2Icon } from 'lucide-react';

import { EmptyState } from '@/app/_components/empty-state';
import { PostCard } from '@/app/_components/post-card';
import type { FragmentType } from '@/gql';
import { getFragmentData, graphql } from '@/gql';

export const PostList_connection = graphql(`
  fragment PostList_connection on PostConnection {
    pageInfo {
      hasNextPage
    }
    edges {
      cursor
      node {
        ...PostCard_post
      }
    }
  }
`);

export function PostList({
  connections,
  onLoadMore,
  loadingMore = false,
  emptyTitle = 'Nenhum post ainda',
  emptyDescription,
}: {
  connections: readonly FragmentType<typeof PostList_connection>[];
  onLoadMore?: () => void;
  loadingMore?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const pages = getFragmentData(PostList_connection, connections);
  const edges = pages
    .flatMap((page) => page.edges)
    .filter((edge) => edge !== null);
  const hasNextPage = pages.at(-1)?.pageInfo.hasNextPage ?? false;

  if (edges.length === 0) {
    return (
      <EmptyState
        icon={FileTextIcon}
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {edges.map((edge) => (
          <PostCard key={edge.cursor} post={edge.node} />
        ))}
      </div>

      {hasNextPage && onLoadMore ? (
        <div className="flex justify-center">
          <Button variant="outline" disabled={loadingMore} onClick={onLoadMore}>
            {loadingMore ? <Loader2Icon className="animate-spin" /> : null}
            Carregar mais
          </Button>
        </div>
      ) : null}
    </div>
  );
}
