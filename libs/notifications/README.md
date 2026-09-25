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
| `OnDemandNotifiable` | someone known only by where to reach them — an address being verified, an invitee — notified exactly like an aggregate, but only through the channels it was given a route for |
| `OnDemandNotifications` | the port that sends to one, from code that saves no aggregate; `PublishingOnDemandNotifications` publishes and resolves once the event has left |
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
  inject: [mailConfig.KEY],
  useFactory: ({ transport, from }: MailConfig) => ({
    transport,
    defaults: { from },
    template: { resolver: new ReactEmailTemplateResolver() },
    plugins: [plainTextFromHtml()],
  }),
}),
NotificationChannelsModule.forRootAsync({
  notifications: [PostCreatedNotification],
  inject: [firebaseConfig.KEY],
  useFactory: ({ push }: FirebaseConfig) => ({ push }),
}),
```

The application's configuration builds `push`: `apps/notificator`'s `config/firebase.config.ts` is
`registerAs('firebase', () => ({ push: firebasePushOptionsFromEnv(process.env) }))` — this library
parses the service account, the application decides where it is read from.

`notifications` is the registration: a type nothing listed answers for fails the delivery with
`UnknownNotificationTypeException`. `push` is optional — without `FIREBASE_CREDENTIALS` the channel
sends nothing and says so, and a retry would not change that. `email` sends through the `MailSender` a
global `MailModule` binds.

## Notifying someone who is not an aggregate

Laravel calls it on-demand notification, and it is what authentication needs: a password reset goes
to the address that asked, whoever that is.

```ts
await notifications.send(
  OnDemandNotifiable.route(EMAIL_CHANNEL, 'ada@example.com', 'Ada'),
  new PasswordResetNotification({ url, expiresInMinutes: 60 }),
);
```

It raises the same `NotificationReceivedEvent` a `User` does, so the process that delivers cannot tell
the two apart and does not need to. What differs is what it can be reached through: there is no
identity to keep a record against, so `database` is never one of its channels, and `notify` refuses a
notification asking for a channel it has no route for (`UnroutableNotificationException`) rather than
delivering part of it. An authentication notification says `via() { return [EMAIL_CHANNEL]; }`.

`send` needs no command: `PublishingOnDemandNotifications` merges the notifiable into the
application's `EventPublisher` and commits inside a unit of work, so it resolves only once the event
has gone out — which is what a Better Auth callback, and a function frozen the moment it returns,
need. Inside a unit that is already open it joins it instead. `LoggingOnDemandNotifications` sends
nothing and logs the type and the address (never the data — that is where a link or a code is), for a
process with no transport. `RecordingOnDemandNotifications` (`testing/`) keeps what it was asked to
send.

## Delivering once, and again when it failed

- **The id is derived.** A notification constructed with a `key` gets a version-5 UUID over its type,
  its key and its notifiable, so notifying the same thing twice — a retried saga — is one notification.
- **The ledger.** The delivering command skips every channel `NotificationDelivery` already has for
  the notification, and records a channel only after it delivered. A channel that throws fails the
  command, the ingestion and the message, and the transport redelivers it; on the retry the channels
  that succeeded are skipped. An email cannot be rolled back, which is why this is a ledger and not a
  transaction.
- **The record is stored once.** `saveIfAbsent` is `insert … on conflict do nothing`.
- **A deleted record stays deleted.** `NotificationRecordRepository.remove` deletes the row and
  nothing else. The ledger keeps its `database` row, so a redelivery of the same event skips that
  channel instead of storing the notification again.

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
