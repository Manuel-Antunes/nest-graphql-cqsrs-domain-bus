import {
  emailTemplateNamed,
  renderEmailTemplate,
} from '@nestposts/mail/email-template';
import { InvalidNotificationException } from '@nestposts/notifications/domain/notification/exception/invalid-notification.exception';
import { Notification } from '@nestposts/notifications/domain/notification/notification';
import { NotificationRecipient } from '@nestposts/notifications/domain/notification/notification-recipient';

import { PostCreatedNotificationMail } from '../../../mail/post-created-notification.mail';
import { PostCreatedEmail } from '../../../mail/templates/post-created.email';
import { PostId } from '../vo/post-id';
import { PostTitle } from '../vo/post-title';
import {
  POST_CREATED_NOTIFICATION,
  PostCreatedNotification,
} from './post-created.notification';

const post = {
  id: PostId.parse('0c1ee4d8-9b0d-4a8a-9d5f-2b1a5e7c3f10'),
  title: PostTitle.parse('Hello, world'),
};
const url = 'https://nestposts.test/posts/0c1ee4d8-9b0d-4a8a-9d5f-2b1a5e7c3f10';

const ana = new NotificationRecipient({
  notifiableType: 'users.User',
  notifiableId: '9f1d1f36-7c2e-4a0a-9b7d-2f5c1a3e4b60',
  notifiableName: 'Ana',
  routes: { email: 'ana@example.com' },
});

describe('PostCreatedNotification', () => {
  it('carries the post as data, keyed by the post', () => {
    const notification = new PostCreatedNotification(post, { url });

    expect(notification.type).toBe(POST_CREATED_NOTIFICATION);
    expect(notification.data).toEqual({
      postId: post.id.value,
      title: 'Hello, world',
      url,
    });
    expect(notification.key).toBe(post.id.value);
  });

  it('is stored and emailed', () => {
    expect(new PostCreatedNotification(post, { url }).channelsFor(ana)).toEqual(
      ['database', 'email'],
    );
  });

  it('refuses a link that is not a URL', () => {
    expect(
      () => new PostCreatedNotification(post, { url: 'not a url' }),
    ).toThrow(InvalidNotificationException);
  });

  it('reads as an email to the author, rendered from its React template', async () => {
    const mail = new PostCreatedNotification(post, { url }).toMail(ana);

    const message = await mail.build();

    expect(mail).toBeInstanceOf(PostCreatedNotificationMail);
    expect(message.hasTo('ana@example.com', 'Ana')).toBe(true);
    expect(message.hasSubject('Your post “Hello, world” is live')).toBe(true);
    expect(message.hasView(PostCreatedEmail)).toBe(true);

    const { view } = message.toObject();
    const html = await renderEmailTemplate(
      emailTemplateNamed(view?.template ?? ''),
      view?.context ?? {},
    );
    expect(html).toContain('Hi Ana,');
    expect(html).toContain('Hello, world');
    expect(html).toContain(`href="${url}"`);
  });

  it('is rebuilt from its record on the side that delivers it', () => {
    const sent = new PostCreatedNotification(post, { url });

    const restored = Notification.restore(sent.record);

    expect(restored).toBeInstanceOf(PostCreatedNotification);
    expect(restored.data).toEqual(sent.data);
  });
});
