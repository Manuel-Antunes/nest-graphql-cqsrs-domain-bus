import { graphql } from '@/gql';
import { gqlQueryOptions } from '@/lib/graphql/gqlpc';

export const PostByIdQuery = graphql(`
  query PostById($id: ID!) {
    post(id: $id) {
      id
      version
      ...PostArticle_post
      ...PostEditor_post
    }
  }
`);

export const postByIdOptions = (id: string) =>
  gqlQueryOptions(PostByIdQuery, { input: { id } });
