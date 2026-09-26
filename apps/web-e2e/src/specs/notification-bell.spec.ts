import { expect, test } from '../fixtures/test';

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

    test('a new notification puts a dot on the bell, and opening it reads everything', async ({
      app,
      accounts,
      authentication,
      publishing,
      notificationRecords,
    }) => {
      await authentication.signIn(accounts.author);
      postId = await publishing.publishInTheForm({
        title,
        content: 'a post the bell should ring for',
      });

      await expect
        .poll(
          async () => (await notificationRecords.aboutPost(postId)).length,
          {
            timeout: 30_000,
          },
        )
        .toBe(1);

      await app.feed.reopenUntil(async () => {
        await expect(app.notificationBell.unread).toBeVisible({
          timeout: 2_000,
        });
      });

      await app.notificationBell.open();
      const item = app.notificationBell.item(title);
      await expect(item.row).toHaveAttribute('data-fresh', 'true');
      await expect(item.link('Your post is live')).toHaveAttribute(
        'href',
        `/posts/${postId}`,
      );

      await expect(app.notificationBell.allRead).toBeVisible();
      await expect
        .poll(
          async () => (await notificationRecords.aboutPost(postId))[0]?.read_at,
        )
        .not.toBeNull();
    });

    test('deleting a notification removes it for good, and the ledger remembers it was delivered', async ({
      app,
      accounts,
      authentication,
      notificationRecords,
    }) => {
      const [stored] = await notificationRecords.aboutPost(postId);
      await authentication.signIn(accounts.author);
      await app.feed.open();
      await app.notificationBell.open();
      const item = app.notificationBell.item(title);
      await expect(item.row).not.toHaveAttribute('data-fresh');

      await item.delete();

      await expect(item.row).toHaveCount(0);
      await expect
        .poll(async () => (await notificationRecords.aboutPost(postId)).length)
        .toBe(0);
      expect(
        await notificationRecords.channelsThatDelivered(stored.id),
      ).toEqual(['database', 'email']);
    });
  });
