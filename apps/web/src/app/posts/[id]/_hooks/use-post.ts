'use client';

import { useMutation, useSuspenseQuery } from '@apollo/client/react';

import { graphql } from '@/gql';

import { PostByIdQuery } from '../query';

const UpdatePostMutation = graphql(`
  mutation UpdatePost($input: UpdatePostInput!) {
    updatePost(input: $input) {
      id
      version
      ...PostArticle_post
      ...PostEditor_post
    }
  }
`);

const DeletePostMutation = graphql(`
  mutation DeletePost($id: ID!) {
    deletePost(id: $id)
  }
`);

export function usePost(id: string) {
  const { data, error, refetch } = useSuspenseQuery(PostByIdQuery, {
    variables: { id },
    errorPolicy: 'all',
  });

  const [updatePost, updateState] = useMutation(UpdatePostMutation);
  const [deletePost, deleteState] = useMutation(DeletePostMutation, {
    variables: { id },
    refetchQueries: ['FeedPosts'],
  });

  return {
    post: data?.post,
    error,
    refetch,
    update: { run: updatePost, ...updateState },
    remove: { run: deletePost, ...deleteState },
  };
}
