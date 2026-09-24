import { expect, test } from '../fixtures/test';
import type { ServiceDatabase } from '../support/database';

/**
 * **The bell in the header is the database channel, read in the browser.**
 *
 * A post the author publishes comes back to them as a stored notification. The bell carries a dot
 * while anything is unread; opening it lists the notifications, highlights the ones that were new
 * and marks every one of them as read; deleting one removes the row for good, while the delivery
 * ledger keeps its entries so a redelivered event cannot store it again.
 */
test.describe
  .serial('the notification bell', () => {
    const title = `Belled ${Date.now()}`;
    let postId: string;

    const storedFor = (postsStore: ServiceDatabase, id: string) =>
      postsStore.query<{ id: string; read_at: string | null }>(
        `select id, read_at from notifications where data ->> 'postId' = ?`,
        id,
      );

    test('a new notification puts a dot on the bell, and opening it reads everything', async ({
      page,
      accounts,
      signIn,
      postsStore,
    }) => {
      await signIn(accounts.author);
      await page.goto('/posts/new');
      await page.getByLabel('Título').fill(title);
      await page.getByLabel('Conteúdo').fill('a post the bell should ring for');
      await page.getByRole('button', { name: 'Publicar' }).click();
      const href = await page
        .getByRole('link', { name: 'Abrir o post' })
        .getAttribute('href');
      postId = href?.split('/').pop() as string;

      await expect
        .poll(async () => (await storedFor(postsStore, postId)).length, {
          timeout: 30_000,
        })
        .toBe(1);

      await expect(async () => {
        await page.goto('/feed');
        await expect(
          page.getByRole('button', { name: /^Notifications, \d+ unread$/ }),
        ).toBeVisible({ timeout: 2_000 });
      }).toPass();

      await page.getByRole('button', { name: /^Notifications/ }).click();
      const item = page
        .getByRole('list', { name: 'Notifications' })
        .getByRole('listitem')
        .filter({ hasText: title });
      await expect(item).toHaveAttribute('data-fresh', 'true');
      await expect(
        item.getByRole('link', { name: 'Your post is live' }),
      ).toHaveAttribute('href', `/posts/${postId}`);

      await expect(
        page.getByRole('button', { name: 'Notifications', exact: true }),
      ).toBeVisible();
      await expect
        .poll(async () => (await storedFor(postsStore, postId))[0]?.read_at)
        .not.toBeNull();
    });

    test('deleting a notification removes it for good, and the ledger remembers it was delivered', async ({
      page,
      accounts,
      signIn,
      postsStore,
    }) => {
      const [stored] = await storedFor(postsStore, postId);
      await signIn(accounts.author);
      await page.goto('/feed');
      await page.getByRole('button', { name: /^Notifications/ }).click();
      const item = page
        .getByRole('list', { name: 'Notifications' })
        .getByRole('listitem')
        .filter({ hasText: title });
      await expect(item).not.toHaveAttribute('data-fresh');

      await item.getByRole('button', { name: /^Delete notification/ }).click();

      await expect(item).toHaveCount(0);
      await expect
        .poll(async () => (await storedFor(postsStore, postId)).length)
        .toBe(0);
      const ledger = await postsStore.query<{ channel: string }>(
        'select channel from notification_deliveries where notification_id = ? order by channel',
        stored.id,
      );
      expect(ledger.map(({ channel }) => channel)).toEqual([
        'database',
        'email',
      ]);
    });
  });
