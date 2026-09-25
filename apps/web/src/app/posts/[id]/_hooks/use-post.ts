'use client';

import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';

import { feedPostsOptions } from '@/app/feed/query';
import { graphql } from '@/gql';
import { gqlMutationOptions } from '@/lib/graphql/gqlpc';

import { postByIdOptions } from '../query';

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
  const queryClient = useQueryClient();
  const postById = postByIdOptions(id);
  const { data } = useSuspenseQuery(postById);

  const invalidateFeed = () =>
    void queryClient.invalidateQueries({
      queryKey: feedPostsOptions().queryKey,
    });

  const update = useMutation(
    gqlMutationOptions(UpdatePostMutation, {
      onSuccess: ({ updatePost }) => {
        queryClient.setQueryData(postById.queryKey, { post: updatePost });
        invalidateFeed();
      },
    }),
  );

  const remove = useMutation(
    gqlMutationOptions(DeletePostMutation, { onSuccess: invalidateFeed }),
  );

  return {
    post: data.post,
    update: {
      run: update.mutateAsync,
      loading: update.isPending,
      error: update.error,
    },
    remove: {
      run: () => remove.mutateAsync({ id }),
      loading: remove.isPending,
      error: remove.error,
    },
  };
}
