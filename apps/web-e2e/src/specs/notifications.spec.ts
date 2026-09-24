import { expect, test } from '../fixtures/test';
import { graphql } from '../gql';

const MyNotifications = graphql(`
  query MyNotifications {
    notifications {
      id
      type
      data
      read
    }
  }
`);

const ReadNotification = graphql(`
  mutation ReadNotification($id: ID!) {
    markNotificationAsRead(id: $id) {
      id
      read
      readAt
    }
  }
`);

interface StoredNotification {
  id: string;
  type: string;
  notifiable_type: string;
  data: { postId: string; title: string; url: string };
}

/**
 * **Publishing a post notifies its author** — by the database and by email, through a service of its
 * own.
 *
 * The post is written in the browser. Once the saga completes it, `posts-api` notifies the author,
 * the notification travels to `notificator` over this run's transport, and that service stores it and
 * mails it through SMTP. What the test reads is where each of those ends up: Mailpit's inbox, the
 * `notifications` table and the delivery ledger — and then the API, as the author.
 */
test.describe
  .serial('the author of a new post is notified', () => {
    const title = `Notified ${Date.now()}`;
    let postId: string;

    test('publishing a post in the browser', async ({
      page,
      accounts,
      signIn,
    }) => {
      await signIn(accounts.author);
      await page.goto('/posts/new');

      await page.getByLabel('Título').fill(title);
      await page
        .getByLabel('Conteúdo')
        .fill('a post somebody should hear about');
      await page.getByRole('button', { name: 'Publicar' }).click();

      const href = await page
        .getByRole('link', { name: 'Abrir o post' })
        .getAttribute('href');
      postId = href?.split('/').pop() as string;
      expect(postId).toMatch(/^[0-9a-f-]{36}$/);
    });

    test('the author receives the email, rendered from its React template', async ({
      accounts,
      mailbox,
    }) => {
      const mailsAboutThePost = async () =>
        (await mailbox.to(accounts.author.email)).filter((mail) =>
          mail.subject.includes(title),
        );

      await expect
        .poll(async () => (await mailsAboutThePost()).length, {
          timeout: 30_000,
        })
        .toBe(1);

      const [mail] = await mailsAboutThePost();
      expect(mail.subject).toBe(`Your post “${title}” is live`);
      expect(mail.from).toBe('no-reply@nestposts.test');
      expect(mail.html).toContain(`Hi ${accounts.author.name},`);
      expect(mail.html).toContain(`/posts/${postId}`);
      expect(mail.text).toContain(title);
    });

    test('the notification is stored, and each channel delivered it once', async ({
      accounts,
      postsStore,
    }) => {
      const stored = await postsStore.query<StoredNotification>(
        `select n.id, n.type, n.notifiable_type, n.data
           from notifications n
           join users u on u.id = n.notifiable_id
          where u.email = ? and n.data ->> 'postId' = ?`,
        accounts.author.email,
        postId,
      );
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({
        type: 'posts.PostCreated',
        notifiable_type: 'users.User',
        data: { postId, title },
      });

      const deliveries = await postsStore.query<{ channel: string }>(
        'select channel from notification_deliveries where notification_id = ? order by channel',
        stored[0].id,
      );
      expect(deliveries.map(({ channel }) => channel)).toEqual([
        'database',
        'email',
      ]);
    });

    test('the author reads it through the API and marks it as read', async ({
      accounts,
      signIn,
      executeGraphql,
    }) => {
      await signIn(accounts.author);

      const listed = await executeGraphql(MyNotifications);
      expect(listed.errors, JSON.stringify(listed.errors)).toBeUndefined();
      const notification = listed.data?.notifications.find(
        (candidate) =>
          (candidate.data as { postId?: string }).postId === postId,
      );
      expect(notification).toMatchObject({
        type: 'posts.PostCreated',
        read: false,
      });

      const marked = await executeGraphql(ReadNotification, {
        id: notification?.id as string,
      });
      expect(marked.errors, JSON.stringify(marked.errors)).toBeUndefined();
      expect(marked.data?.markNotificationAsRead).toMatchObject({
        id: notification?.id,
        read: true,
      });
    });
  });
