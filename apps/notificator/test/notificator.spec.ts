import { Test } from '@nestjs/testing';
import { inRequestContext, MikroORM } from '@nestposts/database';
import { MailSender } from '@nestposts/mail/mail-sender';
import type { CapturingMailSender } from '@nestposts/mail/testing/capturing-mail-sender';
import { capturingMailSender } from '@nestposts/mail/testing/capturing-mail-sender';
import { NotificationDelivery } from '@nestposts/notifications/domain/delivery/notification-delivery';
import { NotificationReceivedEvent } from '@nestposts/notifications/domain/notification/event/notification-received.event';
import { NotificationRecord } from '@nestposts/notifications/domain/notification/notification-record.entity';
import { NotificationId } from '@nestposts/notifications/domain/notification/vo/notification-id';
import { PostId } from '@nestposts/posts/domain/post/vo/post-id';
import {
  EventEnvelope,
  MemoryClient,
  MemoryEventEnvelopeSerializer,
  MessageInbox,
  TRANSPORT_IDENTIFIER,
  TRANSPORT_MESSAGE_TYPE,
  TRANSPORT_ORIGIN,
  TRANSPORT_TAGS,
  TRANSPORT_TIMESTAMP,
} from '@nestposts/transport-eventbus';
import type { InProcessService } from '@nestposts/transport-eventbus/testing';
import { startInProcessService } from '@nestposts/transport-eventbus/testing';
import { lastValueFrom } from 'rxjs';

import { AppModule } from '../src/app.module';
import { until } from './support/until';

interface RenderedMail {
  to: { address: string; name: string }[];
  subject: string;
  html: string;
  text: string;
}

describe('the notificator service', () => {
  let notificator: InProcessService;
  let postsApi: MemoryClient;
  let mails: CapturingMailSender;

  const notificationFrom = (
    notificationId = NotificationId.generate().value,
    metadata: Record<string, string> = {},
    identifier = `evt-${notificationId}`,
  ) => {
    const postId = PostId.generate().value;
    return new EventEnvelope(
      new NotificationReceivedEvent(
        notificationId,
        'posts.PostCreated',
        'users.User',
        'ana',
        {
          postId,
          title: 'Nest + GraphQL',
          url: `http://localhost:4200/posts/${postId}`,
        },
        ['database', 'email'],
        { notifiableName: 'Ana', routes: { email: 'ana@example.com' } },
        new Date('2026-09-23T12:00:00.000Z'),
      ),
      {
        [TRANSPORT_MESSAGE_TYPE]: 'notifications.NotificationReceived#1.0.0',
        [TRANSPORT_IDENTIFIER]: identifier,
        [TRANSPORT_TIMESTAMP]: '2026-09-23T12:00:00.000Z',
        [TRANSPORT_ORIGIN]: 'posts-api',
        [TRANSPORT_TAGS]: `notificationId=${notificationId}`,
        ...metadata,
      },
    );
  };

  const deliver = (envelope: EventEnvelope<NotificationReceivedEvent>) =>
    lastValueFrom(
      postsApi.emit(
        `notifications.NotificationReceived.${envelope.data.notificationId}`,
        envelope,
      ),
    );

  const recordsOf = (notificationId: string) =>
    notificator.app
      .get(MikroORM)
      .em.fork()
      .find(NotificationRecord, { id: NotificationId.parse(notificationId) });

  const deliveriesOf = async (notificationId: string) =>
    (
      await notificator.app
        .get(MikroORM)
        .em.fork()
        .find(
          NotificationDelivery,
          { notificationId },
          { orderBy: { channel: 'asc' } },
        )
    ).map((delivery) => delivery.channel);

  const mailsTo = (address: string) =>
    mails.sent
      .map((sent) => JSON.parse(sent.response as string) as RenderedMail)
      .filter((mail) => mail.to.some((to) => to.address === address));

  beforeAll(async () => {
    notificator = await startInProcessService(
      await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(MailSender)
        .useFactory(capturingMailSender)
        .compile(),
    );
    postsApi = new MemoryClient({
      servers: [notificator.server],
      serializer: new MemoryEventEnvelopeSerializer(),
    });
    mails = notificator.app.get(MailSender);
  });

  afterAll(() => notificator.close());

  beforeEach(() => {
    mails.sent.length = 0;
  });

  it('binds its queue to the one event it delivers', () => {
    expect(postsApi.bindings()).toEqual([
      'notifications.NotificationReceived.*',
    ]);
  });

  it('stores the notification and emails it, rendered from its React template', async () => {
    const message = notificationFrom();

    await deliver(message);
    await until(
      async () =>
        (await deliveriesOf(message.data.notificationId)).length === 2,
    );

    const [record] = await recordsOf(message.data.notificationId);
    expect(record).toMatchObject({
      type: 'posts.PostCreated',
      notifiableId: 'ana',
    });
    const [mail] = mailsTo('ana@example.com');
    expect(mail.subject).toBe('Your post “Nest + GraphQL” is live');
    expect(mail.html).toContain('Hi Ana,');
    expect(mail.html).toContain(`href="${message.data.data.url}"`);
    expect(mail.text).toContain('Nest + GraphQL');
  });

  it('remembers the message it received, and who sent it', async () => {
    const message = notificationFrom();

    await deliver(message);
    await until(
      async () =>
        (await deliveriesOf(message.data.notificationId)).length === 2,
    );

    const inbox = notificator.app.get(MessageInbox);
    await expect(
      inRequestContext(notificator.app.get(MikroORM), () => inbox.received()),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          identifier: `evt-${message.data.notificationId}`,
          messageType: 'notifications.NotificationReceived#1.0.0',
          origin: 'posts-api',
        }),
      ]),
    );
  });

  it('delivers once, however many times the notification arrives', async () => {
    const notificationId = NotificationId.generate().value;

    await deliver(notificationFrom(notificationId));
    await until(async () => (await deliveriesOf(notificationId)).length === 2);
    await deliver(notificationFrom(notificationId, {}, 'another-identifier'));
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(await recordsOf(notificationId)).toHaveLength(1);
    expect(mails.sent).toHaveLength(1);
  });

  it('retries a failed delivery without repeating the channels that succeeded', async () => {
    const message = notificationFrom();
    mails.failNext();

    await deliver(message).catch(() => undefined);
    await until(
      async () =>
        (await deliveriesOf(message.data.notificationId)).length === 1,
    );
    await deliver(message).catch(() => undefined);
    await until(
      async () =>
        (await deliveriesOf(message.data.notificationId)).length === 2,
    );

    expect(await recordsOf(message.data.notificationId)).toHaveLength(1);
    expect(mails.sent).toHaveLength(1);
  });

  it('drops its own echo', async () => {
    const message = notificationFrom(undefined, {
      [TRANSPORT_ORIGIN]: 'notificator',
    });

    await deliver(message);
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(await recordsOf(message.data.notificationId)).toEqual([]);
    expect(mails.sent).toEqual([]);
  });
});
