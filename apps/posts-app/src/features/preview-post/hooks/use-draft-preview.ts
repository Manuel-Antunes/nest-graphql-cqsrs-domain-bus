import { useMutation, useQuery } from '@apollo/client/react';

import { gql } from '@/graphql/__gen__';

import { EditPostDocument } from '../../edit-post/hooks/use-post-editor';

export const PreviewPostDocument = gql(`
  query PreviewPost
  @tool(
    name: "PreviewPost"
    description: "Shows the person, on screen, a post exactly as it will look on the blog before anything is published or changed, with buttons to publish it (or apply the change), adjust the text, or discard it. Use it every time you have written a post or a change to one for the person: pass the full title and content, and the post's id when it changes an existing post. Nothing is saved until the person presses the app's button, so do not call CreatePost or UpdatePost for the same text."
    extraInputs: [
      { name: "title", type: "string", description: "The post's title, at most 200 characters." }
      { name: "content", type: "string", description: "The post's full content." }
      { name: "postId", type: "string", description: "The id of the post this text replaces; leave it out for a new post." }
    ]
  ) {
    me {
      __typename
      id
      name
    }
  }
`);

export const PublishPostDocument = gql(`
  mutation PublishPost($title: String!, $content: String!)
  @tool(
    name: "PublishPost"
    description: "Publishes a post when the person presses Publish in the posts app, after approving its preview. It is the app's button, not yours: to publish a post yourself, use CreatePost."
  ) {
    createPost(input: { title: $title, content: $content }) {
      id
      title
      content
      createdAt
      version
    }
  }
`);

export function useDraftAuthor() {
  return useQuery(PreviewPostDocument, { fetchPolicy: 'cache-first' });
}

export function useCurrentPost(postId: string | undefined) {
  return useQuery(EditPostDocument, {
    variables: { id: postId ?? '' },
    skip: !postId,
    fetchPolicy: 'cache-first',
  });
}

export function usePublishPost() {
  return useMutation(PublishPostDocument);
}
