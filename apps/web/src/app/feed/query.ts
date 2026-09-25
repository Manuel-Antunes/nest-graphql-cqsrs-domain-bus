import { graphql } from '@/gql';
import { gqlInfiniteOptions } from '@/lib/graphql/gqlpc';

export const FeedPostsQuery = graphql(`
  query FeedPosts($first: Int!, $after: String) {
    posts(first: $first, after: $after) {
      pageInfo {
        hasNextPage
        endCursor
      }
      ...PostList_connection
    }
  }
`);

export const FEED_PAGE_SIZE = 6;

export const feedPostsOptions = () =>
  gqlInfiniteOptions(FeedPostsQuery, {
    input: (after: string | null) => ({ first: FEED_PAGE_SIZE, after }),
    initialPageParam: null as string | null,
    getNextPageParam: ({ posts }) =>
      posts.pageInfo.hasNextPage ? posts.pageInfo.endCursor : null,
  });
