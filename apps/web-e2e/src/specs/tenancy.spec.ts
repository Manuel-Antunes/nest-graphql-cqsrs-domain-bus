import { expect, test } from '../fixtures/test';
import { FeedTotalCount } from '../infrastructure/graphql/operations/posts.operations';

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
      app,
      registration,
      authentication,
      organizations,
      publishing,
      organizationRecords,
      postRecords,
    }) => {
      const author = await registration.freshAuthor('Tenant');
      const stamp = Date.now();
      const acme = `Acme ${stamp}`;
      const globex = `Globex ${stamp}`;
      const inRoot = `root post ${stamp}`;
      const inAcme = `acme post ${stamp}`;
      const inGlobex = `globex post ${stamp}`;

      await authentication.signIn(author);
      const rootPost = await publishing.publishThroughTheApi(inRoot);
      await organizations.create(acme);
      const acmeSlug = await organizationRecords.slugOf(acme);
      const acmePost = await publishing.publishThroughTheApi(inAcme);
      await organizations.create(globex);
      await publishing.publishThroughTheApi(inGlobex);

      await app.feed.open({ settle: true });
      await expect(app.feed.entry(inGlobex)).toBeVisible();
      await expect(app.feed.entry(inAcme)).toHaveCount(0);
      await expect(app.feed.entry(inRoot)).toHaveCount(0);

      await organizations.switchBetween(globex, acme);
      await app.feed.reopenUntil(
        async () => {
          await expect(app.feed.entry(inAcme)).toBeVisible({ timeout: 1_000 });
          await expect(app.feed.entry(inGlobex)).toHaveCount(0);
        },
        { timeout: 20_000, settle: true },
      );

      const rootFromAcme = app.post(rootPost);
      await rootFromAcme.open({ settle: true });
      await expect(
        rootFromAcme.notFound,
        'a post of the root tenant is not found from inside an organization',
      ).toBeVisible();

      await organizations.switchBetween(acme, author.name);
      await expect(async () => {
        await app.feed.open({ settle: true });
        await expect(app.feed.entry(inAcme)).toHaveCount(0);
        await expect(app.feed.entry(inGlobex)).toHaveCount(0);
        await rootFromAcme.open({ settle: true });
        await expect(rootFromAcme.text(inRoot)).toBeVisible({
          timeout: 1_000,
        });
      }).toPass({ timeout: 20_000 });

      const acmeFromRoot = app.post(acmePost);
      await acmeFromRoot.open({ settle: true });
      await expect(
        acmeFromRoot.notFound,
        'an organization’s post is not found from the root tenant',
      ).toBeVisible();

      expect(await postRecords.titlesInTenant(acmeSlug)).toEqual([inAcme]);
      expect(
        await postRecords.count(inAcme, inGlobex),
        'nothing written in an organization reached the root tenant',
      ).toBe(0);
    });

    test('a tenant nobody belongs to is refused, whatever the browser claims', async ({
      accounts,
      visitors,
    }) => {
      const claimant = await visitors.arrive({
        extraHTTPHeaders: { 'x-tenant': 'somebody-elses' },
      });
      await claimant.authentication.signIn(accounts.reader);

      const answer = await claimant.graphql.execute(FeedTotalCount);

      expect(answer.errors?.[0]?.extensions?.code).toBe('FORBIDDEN');
    });
  });
