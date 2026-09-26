import { expect, test } from '../fixtures/test';
import { PostCompletion } from '../infrastructure/graphql/operations/posts.operations';

/**
 * **The subgraph, called the way a router calls it** — from the screen that does it on purpose.
 *
 * `_entities(representations:)` is the one entry point a federation router uses that no page of this
 * client would ever need: it takes keys, not queries, and it answers one entity per position. The
 * page sends a batch built out of what the feed already knows — a `Post`, its `Author`, its `Tag` —
 * plus the two refusals that are the interesting part: an author asked for as a `User`, and a key
 * that resolves to nothing. Both come back `null`, in their own position, with no error.
 *
 * It runs anonymously, which is the claim: the router holds no session.
 */
test.describe
  .serial('the subgraph, resolved by key', () => {
    test('a complete post gives the screen something to resolve', async ({
      accounts,
      authentication,
      publishing,
      graphql,
    }) => {
      await authentication.signIn(accounts.author);

      const postId = await publishing.publishThroughTheApi(
        `Federated ${Date.now()}`,
        'the body',
      );

      await expect
        .poll(
          async () =>
            (await graphql.execute(PostCompletion, { id: postId })).data?.post
              ?.version,
          {
            message:
              'the other service has to complete the post before it carries a tag',
          },
        )
        .toBe(2);
    });

    test('the screen resolves the keys the router would send', async ({
      app,
    }) => {
      await app.federation.open();

      await expect(app.federation.heading).toBeVisible();
      await app.federation.resolveRepresentations();

      await expect(app.federation.received).toContainText('"Post"');
      await expect(app.federation.received).toContainText('"Tag"');
      await expect(app.federation.received).toContainText('"Author"');
    });

    test('a key that resolves to nothing is null in its own position, and so is the wrong type', async ({
      app,
    }) => {
      await app.federation.open();
      await app.federation.resolveRepresentations();

      const answers = await app.federation.answersByPosition();

      expect(
        answers.length,
        'one answer per representation sent',
      ).toBeGreaterThan(3);
      expect(
        answers.filter((answer) => answer.endsWith('null')).length,
        'the missing post, and every author asked for as a User',
      ).toBeGreaterThanOrEqual(2);
    });

    test('the router holds no session, and the subgraph still answers', async ({
      visitors,
    }) => {
      const anonymous = await visitors.arrive();

      await anonymous.app.federation.open();
      await expect(anonymous.app.federation.withoutSession).toBeVisible();
      await anonymous.app.federation.resolveRepresentations();

      await expect(anonymous.app.federation.received).toContainText('"Post"');
      await expect(anonymous.app.header.signInLink).toBeVisible();
    });
  });
