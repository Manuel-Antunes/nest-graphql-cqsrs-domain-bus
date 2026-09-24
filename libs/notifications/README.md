# notifications

Notifications as a domain concept, after
[adonisjs-notifications](https://github.com/osenco/adonisjs-notifications): an aggregate is
**notified**, and each notification decides which channels tell it — the database, email, push.

```ts
@NotificationType('posts.PostCreated')
export class PostCreatedNotification
  extends Notification<PostCreatedNotificationData>
  implements MailNotification
{
  static override readonly schema = PostCreatedNotificationSchema;

  constructor(post: Post, links: { url: string }) {
    super({ postId: post.id.value, title: post.title.value, url: links.url }, { key: post.id.value });
  }

  override via() {
    return [DATABASE_CHANNEL, EMAIL_CHANNEL];
  }

  toMail(recipient: NotificationRecipient) {
    return new PostCreatedNotificationMail(this.data, recipient);
  }
}

user.notify(new PostCreatedNotification(post, { url }));
user.commit();
```

## The pieces

| | what it is |
|---|---|
| `Notification` | behaviour: `via` (the channels, `database` by default) and whatever channel interfaces it implements. Its data lives in its record |
| `NotificationRecord` | the data: type, who it is for, what it says, whether it was read. The `database` channel stores it as it is, and the delivering process rebuilds the notification from it |
| `@NotificationType('…')` | the name a class is stored and delivered under. `Notification.restore(record)` finds the class by it |
| `Notifiable(Base)` | the mixin that makes an aggregate root notifiable. `notify` raises `NotificationReceivedEvent`; the host says who it is (`notifiableType`, `notifiableId`, `notifiableName`) and where each channel reaches it (`routeNotificationFor`) |
| `NotificationRecipient` | the notifiable as it was when notified — what the channels deliver to, in a process that holds no aggregate |
| `MailNotification`, `PushNotification` | what a notification implements to go through `email` (`toMail` → a `Mail` of `@nestposts/mail`) and `push` (`toPush` → an FCM message). A channel checks it with `isMailNotification` / `isPushNotification` |
| `NotificationDelivery` | the ledger: one row per notification and channel that delivered it |
| `Device` | a push token, owned by a notifiable by kind and id |

## Two halves, in two processes

**Notifying** needs the domain only. `notify` evaluates `via` against the live aggregate, snapshots
the recipient, addresses the record and raises `NotificationReceivedEvent`
(`notifications.NotificationReceived`, one stream per notification) — which leaves at `commit()`
through whatever publishes the `notifications` namespace. `apps/posts-api` does this, in the saga that
reacts to `PostCreated`.

**Delivering** is `NotificationChannelsModule`, and `apps/notificator` is where it runs:

```ts
MailModule.forRootAsync({
  useFactory: () => ({
    transport,
    defaults: { from },
    template: { resolver: new ReactEmailTemplateResolver() },
    plugins: [plainTextFromHtml()],
  }),
}),
NotificationChannelsModule.forRoot({
  notifications: [PostCreatedNotification],
  push: firebasePushOptionsFromEnv(),
}),
```

`notifications` is the registration: a type nothing listed answers for fails the delivery with
`UnknownNotificationTypeException`. `push` is optional — without `FIREBASE_CREDENTIALS` the channel
sends nothing and says so, and a retry would not change that. `email` sends through the `MailSender` a
global `MailModule` binds.

## Delivering once, and again when it failed

- **The id is derived.** A notification constructed with a `key` gets a version-5 UUID over its type,
  its key and its notifiable, so notifying the same thing twice — a retried saga — is one notification.
- **The ledger.** The delivering command skips every channel `NotificationDelivery` already has for
  the notification, and records a channel only after it delivered. A channel that throws fails the
  command, the ingestion and the message, and the transport redelivers it; on the retry the channels
  that succeeded are skipped. An email cannot be rolled back, which is why this is a ledger and not a
  transaction.
- **The record is stored once.** `saveIfAbsent` is `insert … on conflict do nothing`.

What is still at-least-once is the gap between a channel delivering and its ledger row: a crash there
resends that one channel.

## Tables

`notifications`, `notification_deliveries` and `devices`, through `NotificationsInfrastructureModule`
(`notificationsEntities`). In this repository they live in the **`posts`** schema, beside the users
they are addressed to, and `apps/notificator` connects to that schema — the documented exception to
a schema per service.

## Adding a channel

A channel name, an interface the notifications that support it implement, a guard for it, and a
`NotificationChannel` whose `deliver` checks the guard and throws only for what a retry could fix.
Register it with `NotificationChannelsModule.forRoot({ channels: [SmsChannel] })`.
