import { expect, test } from '../fixtures/test';
import { OnPostUpdated } from '../infrastructure/graphql/operations/posts.operations';
import { FederatedMe } from '../infrastructure/graphql/operations/users.operations';

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
    authentication,
    graphql,
  }) => {
    await authentication.signIn(accounts.author);

    const answer = await graphql.execute(FederatedMe);

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
    authentication,
    publishing,
    endpoints,
  }) => {
    await authentication.signIn(accounts.author);
    const postId = await publishing.publishThroughTheApi(
      `Federated ${Date.now()}`,
      'through the gateway',
    );

    const updates = endpoints.subscribeAtGateway(OnPostUpdated, { postId });

    await expect(async () => {
      await publishing.retitle(postId, `Retitled ${Date.now()}`);
      expect(
        updates.received.map(({ onPostUpdated }) => onPostUpdated.id),
      ).toContain(postId);
    }).toPass({ timeout: 20_000 });
  });
});
