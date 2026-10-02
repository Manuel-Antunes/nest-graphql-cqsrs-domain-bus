import { useMutation, useQuery } from '@apollo/client/react';
import { createHydrationUtils, reactive } from '@apollo/client-ai-apps/react';

import { gql } from '@/graphql/__gen__';

export const EditPostDocument = gql(`
  query EditPost($id: ID!)
  @tool(
    name: "EditPost"
    description: "Opens one post, by its id, in an editor on screen with a live preview of how it will look on the blog; the person changes the title and the content there and saves with the app's button, or discards. Use it when the person wants to edit a post whose id you already know; to let them pick it first, use ChoosePostToEdit. Only the post's author can save it."
  ) {
    post(id: $id) {
      id
      title
      version
      ...PostEditor_post
    }
  }
`);

export const SavePostDocument = gql(`
  mutation SavePost($id: ID!, $title: String, $content: String)
  @tool(
    name: "SavePost"
    description: "Saves a change to a post when the person presses Save in the posts app, after reviewing it on screen. It is the app's button, not yours: to change a post yourself, use UpdatePost."
  ) {
    updatePost(input: { id: $id, title: $title, content: $content }) {
      id
      title
      content
      updatedAt
      version
    }
  }
`);

const { useHydratedVariables } = createHydrationUtils(EditPostDocument);

export function usePostEditor(id: string) {
  const [variables] = useHydratedVariables({ id: reactive(id) });
  return useQuery(EditPostDocument, { variables, fetchPolicy: 'cache-first' });
}

export function useSavePost() {
  return useMutation(SavePostDocument);
}
