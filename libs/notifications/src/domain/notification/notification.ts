import type { ZodType } from 'zod';

import { DATABASE_CHANNEL } from '../channel/channel-names';
import { InvalidNotificationException } from './exception/invalid-notification.exception';
import type { INotifiable } from './notifiable';
import type { NotificationData } from './notification-record.entity';
import { NotificationRecord } from './notification-record.entity';
import { notificationClassFor, notificationTypeOf } from './notification-type';
import type { NotificationId } from './vo/notification-id';

export interface NotificationOptions {
  /**
   * What makes two notifications the same one — the post a `PostCreated` is about. With a key, the
   * notification's id is derived from it and from whom it is for, so a retried `notify` does not
   * notify twice.
   */
  key?: string;
}

interface NotificationClass {
  readonly name: string;
  readonly schema?: ZodType<NotificationData>;
  readonly prototype: Notification;
}

const validated = (klass: NotificationClass, data: NotificationData) => {
  if (!klass.schema) return { ...data };
  const parsed = klass.schema.safeParse(data);
  if (!parsed.success) {
    throw new InvalidNotificationException(
      `invalid data for ${klass.name}: ${parsed.error.message}`,
      { cause: parsed.error },
    );
  }
  return parsed.data;
};

/**
 * Something a {@link Notifiable} is told, and every way it can be told.
 *
 * ```ts
 * @NotificationType('posts.PostCreated')
 * export class PostCreatedNotification
 *   extends Notification<PostCreatedNotificationData>
 *   implements MailNotification
 * {
 *   static override readonly schema = PostCreatedNotificationSchema;
 *
 *   constructor(post: Post, links: { url: string }) {
 *     super({ postId: post.id.value, title: post.title.value, url: links.url }, { key: post.id.value });
 *   }
 *
 *   override via() {
 *     return [DATABASE_CHANNEL, EMAIL_CHANNEL];
 *   }
 *
 *   toMail(recipient: NotificationRecipient) {
 *     return new PostCreatedNotificationMail(this.data, recipient);
 *   }
 * }
 * ```
 *
 * Its data lives in its {@link NotificationRecord}, which is what is stored and what travels: a
 * notification is rebuilt on the other side from the record alone, by its `@NotificationType`, and so
 * everything its channels need has to be in the data. The constructor is where a notification turns
 * rich arguments — a `Post` — into that data; {@link restore} bypasses it.
 *
 * `via` answers `database` alone unless a notification says otherwise. Every other channel asks the
 * notification for its own shape through an interface the notification implements — `MailNotification`
 * for `email`, `PushNotification` for `push` — and a new channel brings an interface of its own.
 */
export abstract class Notification<
  TData extends NotificationData = NotificationData,
> {
  /** The shape of the data, checked on construction and on {@link restore}. */
  static readonly schema?: ZodType<NotificationData>;

  readonly record: NotificationRecord;
  readonly key?: string;

  protected constructor(data: TData, options: NotificationOptions = {}) {
    const klass = this.constructor as unknown as NotificationClass;
    this.record = NotificationRecord.draft(
      notificationTypeOf(klass),
      validated(klass, data),
    );
    this.key = options.key;
  }

  get id(): NotificationId {
    return this.record.id;
  }

  get type(): string {
    return this.record.type;
  }

  get data(): TData {
    return this.record.data as TData;
  }

  /** The channels this notification goes through, for this notifiable. */
  via(_notifiable: INotifiable): readonly string[] {
    return [DATABASE_CHANNEL];
  }

  /** {@link via}, without duplicates. */
  channelsFor(notifiable: INotifiable): readonly string[] {
    return [...new Set(this.via(notifiable))];
  }

  /** The notification a record stands for, rebuilt by its type without running its constructor. */
  static restore(record: NotificationRecord): Notification {
    const klass = notificationClassFor<Notification>(record.type);
    const notification = Object.create(klass.prototype) as Notification;
    const data = validated(klass as unknown as NotificationClass, record.data);
    Object.assign(record, { data });
    Object.defineProperty(notification, 'record', {
      value: record,
      enumerable: true,
    });
    return notification;
  }
}
