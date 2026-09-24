import type { Page } from '@playwright/test';
import { print } from 'graphql';

import type { ExecuteGraphql } from '../fixtures/test';
import {
  expect,
  openAuthView,
  signInThroughTheForm,
  test,
} from '../fixtures/test';
import { graphql } from '../gql';
import type { ServiceDatabase } from '../support/database';

const WriteTenantPost = graphql(`
  mutation WriteTenantPost($title: String!) {
    createPost(input: { title: $title, content: "oi" }) {
      id
    }
  }
`);

const ProbeTenantPosts = graphql(`
  query ProbeTenantPosts {
    posts(first: 1) {
      totalCount
    }
  }
`);

const createOrganization = async (page: Page, name: string): Promise<void> => {
  await openAuthView(page, '/settings/organizations');
  await page
    .getByRole('button', { name: 'Create organization' })
    .first()
    .click();
  const create = page.getByRole('dialog', { name: 'Create organization' });
  await create.getByRole('textbox', { name: 'Name' }).fill(name);
  await create.getByRole('button', { name: 'Create organization' }).click();
  await expect(page.getByText(name).first()).toBeVisible();
};

const slugOf = async (
  store: ServiceDatabase,
  name: string,
): Promise<string> => {
  const [row] = await store.query<{ slug: string }>(
    'select slug from organization where name = ?',
    name,
  );
  return row.slug;
};

const write = async (
  executeGraphql: ExecuteGraphql,
  title: string,
): Promise<string> => {
  const created = await executeGraphql(WriteTenantPost, { title });
  expect(created.errors, JSON.stringify(created.errors)).toBeUndefined();
  return created.data?.createPost.id as string;
};

const feedOf = async (page: Page) => {
  await page.goto('/feed');
  await page.waitForLoadState('networkidle');
  return page.locator('main');
};

const postPage = async (page: Page, id: string) => {
  await page.goto(`/posts/${id}`);
  await page.waitForLoadState('networkidle');
  return page.locator('main');
};

const switchFrom = async (
  page: Page,
  active: string,
  next: string,
): Promise<void> => {
  await page.goto('/feed');
  await page.waitForLoadState('networkidle');
  await page.locator('header').getByRole('button', { name: active }).click();
  const switched = page.waitForResponse(
    (response) =>
      response.url().includes('/api/auth/organization/set-active') &&
      response.ok(),
  );
  await page.getByRole('menuitem').filter({ hasText: next }).click();
  await switched;
};

/**
 * **An organization is a tenant: its posts live in a schema of its own.**
 *
 * The organization is created in better-auth-ui, which makes it the active one; the web then names it
 * as the tenant of every request it forwards, the posts-api migrated its schema when it was created,
 * and what is written there is only ever read there. Switching organizations in the header is
 * switching schemas, and the feed follows.
 */
test.describe
  .serial('tenancy', () => {
    test('switching organizations switches the posts the feed shows', async ({
      page,
      freshAccount,
      postsStore,
      executeGraphql,
    }) => {
      const author = await freshAccount('Tenant');
      await postsStore.promoteToAuthor(author.credentialId);
      const stamp = Date.now();
      const acme = `Acme ${stamp}`;
      const globex = `Globex ${stamp}`;

      await signInThroughTheForm(page, author);
      await expect(page.getByText(author.email).first()).toBeVisible();
      const inRoot = `root post ${stamp}`;
      const rootPost = await write(executeGraphql, inRoot);

      await createOrganization(page, acme);
      const acmeSlug = await slugOf(postsStore, acme);
      const inAcme = `acme post ${stamp}`;
      const acmePost = await write(executeGraphql, inAcme);

      await createOrganization(page, globex);
      const inGlobex = `globex post ${stamp}`;
      await write(executeGraphql, inGlobex);

      const globexFeed = await feedOf(page);
      await expect(globexFeed.getByText(inGlobex)).toBeVisible();
      await expect(globexFeed.getByText(inAcme)).toHaveCount(0);
      await expect(globexFeed.getByText(inRoot)).toHaveCount(0);

      await switchFrom(page, globex, acme);
      await expect(async () => {
        const feed = await feedOf(page);
        await expect(feed.getByText(inAcme)).toBeVisible({ timeout: 1_000 });
        await expect(feed.getByText(inGlobex)).toHaveCount(0);
      }).toPass({ timeout: 20_000 });

      await expect(
        (await postPage(page, rootPost)).getByText('Post não encontrado'),
        'a post of the root tenant is not found from inside an organization',
      ).toBeVisible();

      await switchFrom(page, acme, author.name);
      await expect(async () => {
        const feed = await feedOf(page);
        await expect(feed.getByText(inAcme)).toHaveCount(0);
        await expect(feed.getByText(inGlobex)).toHaveCount(0);
        const root = await postPage(page, rootPost);
        await expect(root.getByText(inRoot).first()).toBeVisible({
          timeout: 1_000,
        });
      }).toPass({ timeout: 20_000 });
      await expect(
        (await postPage(page, acmePost)).getByText('Post não encontrado'),
        'an organization’s post is not found from the root tenant',
      ).toBeVisible();

      const acmeTitles = await postsStore.query<{ title: string }>(
        `select title from "tenant_${acmeSlug}".posts order by created_at`,
      );
      expect(acmeTitles.map((row) => row.title)).toEqual([inAcme]);
      expect(
        (
          await postsStore.query<{ title: string }>(
            'select title from posts where title in (?, ?)',
            inAcme,
            inGlobex,
          )
        ).length,
        'nothing written in an organization reached the root tenant',
      ).toBe(0);
    });

    test('a tenant nobody belongs to is refused, whatever the browser claims', async ({
      browser,
      accounts,
    }) => {
      const context = await browser.newContext({
        extraHTTPHeaders: { 'x-tenant': 'somebody-elses' },
      });
      const page = await context.newPage();
      await signInThroughTheForm(page, accounts.reader);
      await expect(page.getByText(accounts.reader.email).first()).toBeVisible();

      const answer = await page.evaluate(async (query) => {
        const response = await fetch('/api/graphql', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ query }),
        });
        return response.json() as Promise<{
          errors?: { extensions?: { code?: string } }[];
        }>;
      }, print(ProbeTenantPosts));

      expect(answer.errors?.[0]?.extensions?.code).toBe('FORBIDDEN');
      await context.close();
    });
  });
