import '@apollo/client-ai-apps';

import type {
  ChoosePostToEditQueryVariables,
  EditPostQueryVariables,
  PublishPostMutationVariables,
  SavePostMutationVariables,
} from '../graphql/__gen__/graphql';

declare module '@apollo/client-ai-apps' {
  interface Register {
    toolInputs: {
      ChoosePostToEdit: ChoosePostToEditQueryVariables;
      EditPost: EditPostQueryVariables;
      PreviewPost: { title?: string; content?: string; postId?: string };
      SavePost: SavePostMutationVariables;
      PublishPost: PublishPostMutationVariables;
    };
  }
}
