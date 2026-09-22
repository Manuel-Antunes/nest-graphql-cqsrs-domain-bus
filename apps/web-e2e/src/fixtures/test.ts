import { test as base, expect } from '@playwright/test';

import type { Account, Accounts } from '../support/accounts';
import type { ExecuteGraphql } from '../support/graphql';
import { Broker } from '../support/broker';
import { ServiceDatabase } from '../support/database';
import { graphqlExecutor } from '../support/graphql';
import { PostsApi } from '../support/posts-api';
import { RunningStack } from '../support/running-stack';
import { POSTS_SCHEMA, TAGGING_SCHEMA } from '../support/stack';

export interface SignIn {
  (account: Account): Promise<void>;
}

export type { ExecuteGraphql, GraphQlAnswer } from '../support/graphql';

interface Fixtures {
  accounts: Accounts;
  signIn: SignIn;
  executeGraphql: ExecuteGraphql;
  apiUrl: string;
  postsStore: ServiceDatabase;
  taggingStore: ServiceDatabase;
  broker: Broker;
}

/**
 * The browser's fixtures, plus the three things a browser cannot see: each service's durable state
 * and the broker's topology.
 *
 * A Playwright test is Node, so the assertions that used to need a second suite live here — which is
 * what lets one test say "the page shows this, and this is what the other process actually kept".
 */
export const test = base.extend<Fixtures>({
  accounts: async ({}, use) => {
    await use(RunningStack.accounts());
  },

  /** The posts-api's own origin — for the one assertion that has to bypass the web deliberately. */
  apiUrl: async ({}, use) => {
    await use(new PostsApi().url);
  },

  postsStore: async ({}, use) => {
    await use(new ServiceDatabase(POSTS_SCHEMA));
  },

  taggingStore: async ({}, use) => {
    await use(new ServiceDatabase(TAGGING_SCHEMA));
  },

  broker: async ({}, use) => {
    await use(new Broker());
  },

  /**
   * GraphQL **as the browser asks it**: through `/api/graphql`, the proxy that puts this request's
   * cookie and its `x-tenant` on the way out. It is how the page itself queries, so what it proves is
   * what a user gets — not what a script with a hand-built header gets.
   *
   * What it takes is a document `graphql()` built from the SDL, not a string: the schema is the one
   * the API serves, so a field that does not exist is a compile error here, and the answer is typed
   * without a spec having to say what it is.
   *
   * The `goto` is not ceremony: a relative URL has no base until the page has navigated somewhere,
   * and a test that only reads durable state never navigates.
   */
  executeGraphql: async ({ page }, use) => {
    await use(
      graphqlExecutor(async (query, variables) => {
        if (!page.url().startsWith('http')) {
          await page.goto('/');
        }
        return page.evaluate(
          async ([document, args]) => {
            const response = await fetch('/api/graphql', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ query: document, variables: args }),
            });
            return response.json();
          },
          [query, variables] as const,
        );
      }),
    );
  },

  /**
   * Signs in **through the form**, which is the only way this suite ever authenticates: the session
   * cookie has to be one `apps/web`'s own Better Auth wrote, on the web's origin.
   */
  signIn: async ({ page }, use) => {
    await use(async (account: Account) => {
      await page.goto('/login');
      await page.getByLabel('E-mail').fill(account.email);
      await page.getByLabel('Senha').fill(account.password);
      await page.getByRole('button', { name: 'Entrar' }).click();
      await expect(page.getByText(account.email).first()).toBeVisible();
    });
  },
});

export { expect } from '@playwright/test';
