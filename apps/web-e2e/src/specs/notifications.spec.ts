import { expect, test } from '../fixtures/test';
import {
  MyNotifications,
  ReadNotification,
} from '../infrastructure/graphql/operations/notifications.operations';
import { EmailSender, EmailSubject } from '../model/email';

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
      accounts,
      authentication,
      publishing,
    }) => {
      await authentication.signIn(accounts.author);

      postId = await publishing.publishInTheForm({
        title,
        content: 'a post somebody should hear about',
      });

      expect(postId).toMatch(/^[0-9a-f-]{36}$/);
    });

    test('the author receives the email, rendered from its React template', async ({
      accounts,
      mailbox,
    }) => {
      const mailsAboutThePost = () =>
        mailbox.withSubjectContaining(accounts.author.email, title);

      await expect
        .poll(async () => (await mailsAboutThePost()).length, {
          timeout: 30_000,
        })
        .toBe(1);

      const [mail] = await mailsAboutThePost();
      expect(mail.subject).toBe(EmailSubject.postIsLive(title));
      expect(mail.from).toBe(EmailSender.ADDRESS);
      expect(mail.html).toContain(`Hi ${accounts.author.name},`);
      expect(mail.html).toContain(`/posts/${postId}`);
      expect(mail.text).toContain(title);
    });

    test('the notification is stored, and each channel delivered it once', async ({
      accounts,
      notificationRecords,
    }) => {
      const stored = await notificationRecords.toUserAboutPost(
        accounts.author.email,
        postId,
      );
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({
        type: 'posts.PostCreated',
        notifiable_type: 'users.User',
        data: { postId, title },
      });

      expect(
        await notificationRecords.channelsThatDelivered(stored[0].id),
      ).toEqual(['database', 'email']);
    });

    test('the author reads it through the API and marks it as read', async ({
      accounts,
      authentication,
      graphql,
    }) => {
      await authentication.signIn(accounts.author);

      const listed = await graphql.execute(MyNotifications);
      expect(listed.errors, JSON.stringify(listed.errors)).toBeUndefined();
      const notification = listed.data?.notifications.find(
        (candidate) =>
          (candidate.data as { postId?: string }).postId === postId,
      );
      expect(notification).toMatchObject({
        type: 'posts.PostCreated',
        read: false,
      });

      const marked = await graphql.execute(ReadNotification, {
        id: notification?.id as string,
      });
      expect(marked.errors, JSON.stringify(marked.errors)).toBeUndefined();
      expect(marked.data?.markNotificationAsRead).toMatchObject({
        id: notification?.id,
        read: true,
      });
    });
  });
