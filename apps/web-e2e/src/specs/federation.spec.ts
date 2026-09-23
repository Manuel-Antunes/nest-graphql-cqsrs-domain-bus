import { expect, test } from '../fixtures/test';
import { graphql } from '../gql';

const CreateFederatedPost = graphql(`
  mutation CreateFederatedPost($title: String!) {
    createPost(input: { title: $title, content: "the body" }) {
      id
    }
  }
`);

const FederatedPostProbe = graphql(`
  query FederatedPostProbe($id: ID!) {
    post(id: $id) {
      version
      author {
        id
      }
      tags(first: 1) {
        edges {
          node {
            name
          }
        }
      }
    }
  }
`);

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
test.describe.serial('the subgraph, resolved by key', () => {
  let postId: string;

  test('a complete post gives the screen something to resolve', async ({
    accounts,
    signIn,
    executeGraphql,
  }) => {
    await signIn(accounts.author);

    const created = await executeGraphql(CreateFederatedPost, {
      title: `Federated ${Date.now()}`,
    });

    expect(created.errors, JSON.stringify(created.errors)).toBeUndefined();
    postId = created.data!.createPost.id;

    await expect
      .poll(
        async () =>
          (await executeGraphql(FederatedPostProbe, { id: postId })).data?.post
            ?.version,
        {
          message:
            'the other service has to complete the post before it carries a tag',
        },
      )
      .toBe(2);
  });

  test('the screen resolves the keys the router would send', async ({
    page,
  }) => {
    await page.goto('/federation');

    await expect(
      page.getByRole('heading', { name: 'Federação' }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: /Resolver \d+ representações/ })
      .click();

    const received = page.getByLabel('Entidades recebidas');
    await expect(received).toContainText('"Post"');
    await expect(received).toContainText('"Tag"');
    await expect(received).toContainText('"Author"');
  });

  test('a key that resolves to nothing is null in its own position, and so is the wrong type', async ({
    page,
  }) => {
    await page.goto('/federation');
    await page
      .getByRole('button', { name: /Resolver \d+ representações/ })
      .click();

    const positions = page
      .getByRole('list', { name: 'Entidades por posição' })
      .getByRole('listitem');

    await expect(positions.first()).toBeVisible();
    const answers = await positions.allInnerTexts();

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
    browser,
  }) => {
    const context = await browser.newContext();
    const anonymous = await context.newPage();

    await anonymous.goto('/federation');
    await expect(anonymous.getByText('Sem sessão')).toBeVisible();
    await anonymous
      .getByRole('button', { name: /Resolver \d+ representações/ })
      .click();

    await expect(anonymous.getByLabel('Entidades recebidas')).toContainText(
      '"Post"',
    );
    await expect(anonymous.getByRole('link', { name: 'Entrar' })).toBeVisible();

    await context.close();
  });
});
