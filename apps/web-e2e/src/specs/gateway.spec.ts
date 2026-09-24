import { createClient } from 'graphql-sse';

import { expect, test } from '../fixtures/test';
import { graphql } from '../gql';
import { gatewayUrl } from '../support/stack';

const FederatedMe = graphql(`
  query FederatedMe {
    me {
      __typename
      email
      unreadNotificationCount
      notifications(first: 1) {
        id
      }
    }
    unreadNotificationCount
  }
`);

const WritePost = graphql(`
  mutation WritePost($input: CreatePostInput!) {
    createPost(input: $input) {
      id
    }
  }
`);

const RetitlePost = graphql(`
  mutation RetitlePost($input: UpdatePostInput!) {
    updatePost(input: $input) {
      id
      version
    }
  }
`);

/**
 * **The web talks to one endpoint, and it is a federation gateway.**
 *
 * Every operation the browser sends goes through the web's proxy to the gateway, which composes the
 * posts subgraph and the notifications subgraph and forwards the browser's cookie to each. One
 * operation can read from both, and a subscription runs through the gateway over SSE.
 */
test.describe('the federation gateway', () => {
  test('one operation reads the user from the posts subgraph and what they were told from the notifications one', async ({
    accounts,
    signIn,
    executeGraphql,
  }) => {
    await signIn(accounts.author);

    const answer = await executeGraphql(FederatedMe);

    expect(answer.errors, JSON.stringify(answer.errors)).toBeUndefined();
    expect(answer.data?.me).toMatchObject({
      __typename: 'Author',
      email: accounts.author.email,
    });
    expect(answer.data?.me.unreadNotificationCount).toBe(
      answer.data?.unreadNotificationCount,
    );
  });

  test('a subscription runs through the gateway, over SSE', async ({
    accounts,
    signIn,
    executeGraphql,
  }) => {
    await signIn(accounts.author);
    const written = await executeGraphql(WritePost, {
      input: {
        title: `Federated ${Date.now()}`,
        content: 'through the gateway',
      },
    });
    expect(written.errors, JSON.stringify(written.errors)).toBeUndefined();
    const postId = written.data?.createPost.id as string;

    const client = createClient({ url: gatewayUrl(), retryAttempts: 0 });
    const received: Array<{ id: string; title: string }> = [];
    const unsubscribe = client.subscribe<{
      onPostUpdated: { id: string; title: string };
    }>(
      {
        query:
          'subscription($postId: ID) { onPostUpdated(postId: $postId) { id title } }',
        variables: { postId },
      },
      {
        next: ({ data }) => {
          if (data) received.push(data.onPostUpdated);
        },
        error: () => undefined,
        complete: () => undefined,
      },
    );

    await expect(async () => {
      const retitled = await executeGraphql(RetitlePost, {
        input: { id: postId, title: `Retitled ${Date.now()}` },
      });
      expect(retitled.errors).toBeUndefined();
      expect(received.map(({ id }) => id)).toContain(postId);
    }).toPass({ timeout: 20_000 });

    unsubscribe();
    await client.dispose();
  });
});
