import { useQuery } from '@apollo/client/react';
import { createHydrationUtils } from '@apollo/client-ai-apps/react';

import { gql } from '@/graphql/__gen__';

export const ChoosePostToEditDocument = gql(`
  query ChoosePostToEdit($first: Int = 20)
  @tool(
    name: "ChoosePostToEdit"
    description: "Shows the caller's own posts, newest first, as a list on screen to pick the one to edit; picking one opens it in the app's editor, where the person changes it with a live preview and saves it with the app's button. Use it when the person wants to edit, fix or review one of their posts and has not said which one. Only an author has posts; for anybody else the app says so."
  ) {
    me {
      __typename
      id
      name
      ... on Author {
        posts(first: $first) {
          totalCount
          edges {
            node {
              id
              title
              ...PostRow_post
            }
          }
        }
      }
    }
  }
`);

const { useHydratedVariables } = createHydrationUtils(ChoosePostToEditDocument);

export function useMyPosts() {
  const [variables] = useHydratedVariables({ first: 20 });
  return useQuery(ChoosePostToEditDocument, {
    variables,
    fetchPolicy: 'cache-first',
  });
}
