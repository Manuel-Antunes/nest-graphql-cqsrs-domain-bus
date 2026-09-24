import {
  DATABASE_CHANNEL,
  EMAIL_CHANNEL,
} from '@nestposts/notifications/domain/channel/channel-names';
import type { MailNotification } from '@nestposts/notifications/domain/channel/mail-notification';
import { Notification } from '@nestposts/notifications/domain/notification/notification';
import type { NotificationRecipient } from '@nestposts/notifications/domain/notification/notification-recipient';
import { NotificationType } from '@nestposts/notifications/domain/notification/notification-type';

import { PostCreatedNotificationMail } from '../../../mail/post-created-notification.mail';
import type { Post } from '../post.entity';
import type { PostCreatedNotificationData } from '../schemas/post-created-notification.schema';
import { PostCreatedNotificationSchema } from '../schemas/post-created-notification.schema';

export const POST_CREATED_NOTIFICATION = 'posts.PostCreated';

@NotificationType(POST_CREATED_NOTIFICATION)
export class PostCreatedNotification
  extends Notification<PostCreatedNotificationData>
  implements MailNotification
{
  static override readonly schema = PostCreatedNotificationSchema;

  constructor(post: Pick<Post, 'id' | 'title'>, links: { url: string }) {
    super(
      { postId: post.id.value, title: post.title.value, url: links.url },
      { key: post.id.value },
    );
  }

  override via(): readonly string[] {
    return [DATABASE_CHANNEL, EMAIL_CHANNEL];
  }

  toMail(recipient: NotificationRecipient): PostCreatedNotificationMail {
    return new PostCreatedNotificationMail(this.data, {
      address: recipient.routeNotificationFor(EMAIL_CHANNEL) ?? '',
      name: recipient.notifiableName,
    });
  }
}
