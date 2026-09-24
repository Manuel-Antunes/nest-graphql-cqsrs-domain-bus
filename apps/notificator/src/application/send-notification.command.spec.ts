import { Global, Module } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { CqsrsModule } from '@nestposts/cqsrs';
import { inRequestContext, MikroORM } from '@nestposts/database';
import { MailSender } from '@nestposts/mail/mail-sender';
import { RecordingMailSender } from '@nestposts/mail/testing/recording-mail-sender';
import { NotificationDelivery } from '@nestposts/notifications/domain/delivery/notification-delivery';
import { NotificationReceivedEvent } from '@nestposts/notifications/domain/notification/event/notification-received.event';
import { UnknownNotificationTypeException } from '@nestposts/notifications/domain/notification/exception/notification-type.exception';
import { NotificationRecord } from '@nestposts/notifications/domain/notification/notification-record.entity';
import { NotificationId } from '@nestposts/notifications/domain/notification/vo/notification-id';
import { NotificationChannelsModule } from '@nestposts/notifications/infrastructure/notification-channels.module';
import { PostCreatedNotification } from '@nestposts/posts/domain/post/notification/post-created.notification';
import { PostId } from '@nestposts/posts/domain/post/vo/post-id';
import { TRANSPORT_EVENT_BUS_PUBLISHER } from '@nestposts/transport-eventbus';

import {
  persistenceTesting,
  transportTesting,
} from '../../test/support/transport-testing.module';
import { SendNotificationCommand } from './send-notification.command';

const mails = new RecordingMailSender();

@Global()
@Module({
  providers: [{ provide: MailSender, useValue: mails }],
  exports: [MailSender],
})
class RecordingMailModule {}

const postCreated = (
  overrides: { notificationId?: string; notificationType?: string } = {},
) => {
  const postId = PostId.generate().value;
  return new NotificationReceivedEvent(
    overrides.notificationId ?? NotificationId.generate().value,
    overrides.notificationType ?? 'posts.PostCreated',
    'users.User',
    'ana',
    { postId, title: 'Hello, world', url: `https://web.test/posts/${postId}` },
    ['database', 'email'],
    { notifiableName: 'Ana', routes: { email: 'ana@example.com' } },
    new Date('2026-09-23T12:00:00Z'),
  );
};

describe('SendNotificationCommand.Handler', () => {
  let module: TestingModule;

  const send = (event: NotificationReceivedEvent) =>
    inRequestContext(module.get(MikroORM), () =>
      module
        .get(CommandBus)
        .execute(SendNotificationCommand.SendNotification.of(event)),
    );

  const stored = () =>
    module.get(MikroORM).em.fork().find(NotificationRecord, {});

  const deliveries = () =>
    module
      .get(MikroORM)
      .em.fork()
      .find(NotificationDelivery, {}, { orderBy: { channel: 'asc' } });

  beforeEach(async () => {
    mails.sent.length = 0;
    module = await Test.createTestingModule({
      imports: [
        CqsrsModule.forRoot({
          aggregatePublisher: TRANSPORT_EVENT_BUS_PUBLISHER,
        }),
        ...persistenceTesting(),
        transportTesting(),
        RecordingMailModule,
        NotificationChannelsModule.forRoot({
          notifications: [PostCreatedNotification],
        }),
      ],
      providers: [SendNotificationCommand.Handler],
    }).compile();
    await module.init();
  });

  afterEach(() => module.close());

  it('delivers through every channel the notification goes through', async () => {
    const event = postCreated();

    await send(event);

    const [record] = await stored();
    expect(record).toMatchObject({
      type: 'posts.PostCreated',
      notifiableType: 'users.User',
      notifiableId: 'ana',
      data: event.data,
      readAt: null,
    });
    expect(record.id.value).toBe(event.notificationId);
    expect(mails.sent).toHaveLength(1);
    expect(mails.sent[0].message).toMatchObject({
      to: [{ address: 'ana@example.com', name: 'Ana' }],
      subject: 'Your post “Hello, world” is live',
    });
    expect((await deliveries()).map((delivery) => delivery.channel)).toEqual([
      'database',
      'email',
    ]);
  });

  it('delivers nothing twice when the same notification comes again', async () => {
    const event = postCreated();

    await send(event);
    await send(event);

    expect(await stored()).toHaveLength(1);
    expect(mails.sent).toHaveLength(1);
  });

  it('fails when a channel does, and on the retry sends only what did not go out', async () => {
    const event = postCreated();
    mails.failNext();

    await expect(send(event)).rejects.toThrow('the transport is down');
    expect(await stored()).toHaveLength(1);
    expect((await deliveries()).map((delivery) => delivery.channel)).toEqual([
      'database',
    ]);

    await send(event);

    expect(await stored()).toHaveLength(1);
    expect(mails.sent).toHaveLength(1);
    expect((await deliveries()).map((delivery) => delivery.channel)).toEqual([
      'database',
      'email',
    ]);
  });

  it('refuses a notification type this service was not given', async () => {
    await expect(
      send(postCreated({ notificationType: 'posts.Unknown' })),
    ).rejects.toThrow(UnknownNotificationTypeException);
    expect(await stored()).toEqual([]);
  });
});
