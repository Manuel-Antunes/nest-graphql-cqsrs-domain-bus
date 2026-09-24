import type { Page } from '@playwright/test';
import { test as base, expect } from '@playwright/test';

import type { Account, Accounts } from '../support/accounts';
import { Registrar } from '../support/accounts';
import { Broker } from '../support/broker';
import { ServiceDatabase } from '../support/database';
import type { ExecuteGraphql } from '../support/graphql';
import { graphqlExecutor } from '../support/graphql';
import { Mailbox } from '../support/mailbox';
import type { Messages } from '../support/messages';
import { messagesOf } from '../support/messages';
import { PostsApi } from '../support/posts-api';
import { RunningStack } from '../support/running-stack';
import { ROOT_TENANT, WEB_URL } from '../support/stack';
import { Storage } from '../support/storage';

export type SignIn = (account: Account) => Promise<void>;

/** A new account of its own, signed up and verified by email, for a test that changes what it holds. */
export type FreshAccount = (name: string) => Promise<Account>;

/**
 * Opens one of better-auth-ui's views and waits until it can be typed into. Its forms are TanStack
 * Form state, not the DOM: a field filled before the page hydrates keeps its text on screen and loses
 * it in the form, which then refuses to submit with "This field is required".
 */
export const openAuthView = async (page: Page, path: string): Promise<void> => {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
};

/**
 * Signs in **through the form**, which is the only way this suite ever authenticates: the session
 * cookie has to be one `apps/web`'s own Better Auth wrote, on the web's origin.
 */
export const signInThroughTheForm = async (
  page: Page,
  account: Pick<Account, 'email' | 'password'>,
): Promise<void> => {
  await openAuthView(page, '/auth/sign-in');
  await page.getByRole('textbox', { name: 'Email' }).fill(account.email);
  await page.getByRole('textbox', { name: 'Password' }).fill(account.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
};

export type { ExecuteGraphql, GraphQlAnswer } from '../support/graphql';

interface Fixtures {
  accounts: Accounts;
  signIn: SignIn;
  freshAccount: FreshAccount;
  executeGraphql: ExecuteGraphql;
  apiUrl: string;
  postsStore: ServiceDatabase;
  taggingStore: ServiceDatabase;
  broker: Broker;
  storage: Storage;
  /** Every email the stack sent, as Mailpit received it. */
  mailbox: Mailbox;
  /** What went on the wire, whichever wire this run used — see `support/messages.ts`. */
  messages: (queue: string) => Messages;
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
    await use(ServiceDatabase.ofTenant(ROOT_TENANT));
  },

  taggingStore: async ({}, use) => {
    await use(ServiceDatabase.ofTenant(ROOT_TENANT));
  },

  broker: async ({}, use) => {
    await use(new Broker());
  },

  storage: async ({}, use) => {
    const storage = new Storage();
    await use(storage);
    storage.close();
  },

  mailbox: async ({}, use) => {
    await use(new Mailbox());
  },

  messages: async ({}, use) => {
    await use(messagesOf);
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

  signIn: async ({ page }, use) => {
    await use(async (account: Account) => {
      await signInThroughTheForm(page, account);
      await expect(page.getByText(account.email).first()).toBeVisible();
    });
  },

  freshAccount: async ({ postsStore }, use) => {
    const registrar = new Registrar(WEB_URL, postsStore);
    await use((name) =>
      registrar.signUp(
        `${name.toLowerCase()}-${Date.now()}-${Math.round(Math.random() * 1e6)}@example.com`,
        name,
      ),
    );
  },
});

export { expect } from '@playwright/test';
