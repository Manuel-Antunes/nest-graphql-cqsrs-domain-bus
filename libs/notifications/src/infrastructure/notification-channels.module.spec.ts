import { Global, Module } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import {
  DatabaseModule,
  inRequestContext,
  MikroORM,
} from '@nestposts/database';
import type { AnyMikroORM } from '@nestposts/database/testing';
import {
  TestSchemaModule,
  tableIn,
  testDatabaseConfig,
} from '@nestposts/database/testing';
import { Mail } from '@nestposts/mail/mail';
import { MailSender } from '@nestposts/mail/mail-sender';
import { RecordingMailSender } from '@nestposts/mail/testing/recording-mail-sender';

import {
  DATABASE_CHANNEL,
  EMAIL_CHANNEL,
  PUSH_CHANNEL,
} from '../domain/channel/channel-names';
import type { MailNotification } from '../domain/channel/mail-notification';
import type { PushNotification } from '../domain/channel/push-notification';
import type { PushDelivery } from '../domain/channel/push-notifications';
import { PushNotifications } from '../domain/channel/push-notifications';
import type { PushMessage } from '../domain/channel/schemas/push-message.schema';
import { Device } from '../domain/device/device.entity';
import { DeviceRepository } from '../domain/device/device.repository';
import { Notification } from '../domain/notification/notification';
import { NotificationRecipient } from '../domain/notification/notification-recipient';
import { NotificationRecord } from '../domain/notification/notification-record.entity';
import { NotificationType } from '../domain/notification/notification-type';
import {
  NotificationChannels,
  UnknownNotificationChannelException,
} from './channels/notification-channels';
import { PushDeliveryFailedException } from './channels/push.channel';
import { NotificationChannelsModule } from './notification-channels.module';
import { notificationsEntities } from './notifications-infrastructure.module';

class WelcomeMail extends Mail {
  override subject = 'Welcome';

  constructor(
    private readonly to: string,
    private readonly greeting: string,
  ) {
    super();
  }

  prepare() {
    this.message.to(this.to).html(`<p>${this.greeting}</p>`);
  }
}

@NotificationType('spec.Welcome')
class WelcomeNotification
  extends Notification<{ greeting: string }>
  implements MailNotification, PushNotification
{
  constructor(greeting: string) {
    super({ greeting });
  }

  override via() {
    return [DATABASE_CHANNEL, EMAIL_CHANNEL, PUSH_CHANNEL];
  }

  toMail(recipient: NotificationRecipient) {
    return new WelcomeMail(
      recipient.routeNotificationFor(EMAIL_CHANNEL) as string,
      this.data.greeting,
    );
  }

  toPush(): PushMessage {
    return { notification: { title: 'Welcome', body: this.data.greeting } };
  }
}

@NotificationType('spec.Silent')
class SilentNotification extends Notification {
  constructor() {
    super({});
  }
}

class FakePush extends PushNotifications {
  readonly sent: { tokens: readonly string[]; message: PushMessage }[] = [];
  answer: (tokens: readonly string[]) => PushDelivery = (tokens) => ({
    delivered: tokens.length,
    failed: [],
  });

  async send(tokens: readonly string[], message: PushMessage) {
    this.sent.push({ tokens, message });
    return this.answer(tokens);
  }
}

const mails = new RecordingMailSender();
const push = new FakePush();

@Global()
@Module({
  providers: [{ provide: MailSender, useValue: mails }],
  exports: [MailSender],
})
class RecordingMailModule {}

let moduleRef: TestingModule;
let orm: AnyMikroORM;
let channels: NotificationChannels;

const ana = new NotificationRecipient({
  notifiableType: 'users.User',
  notifiableId: 'ana',
  notifiableName: 'Ana',
  routes: { email: 'ana@example.com' },
});

const addressed = <N extends Notification>(notification: N): N => {
  notification.record.addressTo(ana, new Date('2026-09-23T12:00:00Z'));
  return notification;
};

beforeAll(async () => {
  moduleRef = await Test.createTestingModule({
    imports: [
      DatabaseModule.forRoot({
        ...testDatabaseConfig({ entities: notificationsEntities }, 'channels'),
        exclusive: true,
      }),
      TestSchemaModule.forRoot(),
      RecordingMailModule,
      NotificationChannelsModule.forRoot({
        notifications: [WelcomeNotification, SilentNotification],
      }),
    ],
  })
    .overrideProvider(PushNotifications)
    .useValue(push)
    .compile();
  await moduleRef.init();
  orm = moduleRef.get(MikroORM);
  channels = moduleRef.get(NotificationChannels);
});

afterAll(() => moduleRef?.close());

beforeEach(async () => {
  mails.sent.length = 0;
  push.sent.length = 0;
  await orm.em
    .getConnection()
    .execute(
      `truncate table ${['notifications', 'devices'].map((name) => tableIn(orm, name)).join(', ')}`,
    );
});

describe('NotificationChannelsModule', () => {
  it('delivers through database, email and push, by name', () => {
    expect(channels.names()).toEqual([
      DATABASE_CHANNEL,
      EMAIL_CHANNEL,
      PUSH_CHANNEL,
    ]);
    expect(() => channels.named('carrier-pigeon')).toThrow(
      UnknownNotificationChannelException,
    );
  });

  it('refuses to register a notification class that declared no type', () => {
    class Untyped extends Notification {}

    expect(() =>
      NotificationChannelsModule.forRoot({ notifications: [Untyped] }),
    ).toThrow(/has no @NotificationType/);
  });
});

describe('the database channel', () => {
  it('stores the notification record, and only once', async () => {
    const notification = addressed(new WelcomeNotification('Hello, Ana'));

    await channels.named(DATABASE_CHANNEL).deliver(notification, ana);
    await channels.named(DATABASE_CHANNEL).deliver(notification, ana);

    const stored = await orm.em.fork().find(NotificationRecord, {});
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      type: 'spec.Welcome',
      data: { greeting: 'Hello, Ana' },
    });
  });
});

describe('the email channel', () => {
  it('sends the mail the notification builds for its recipient', async () => {
    await channels
      .named(EMAIL_CHANNEL)
      .deliver(addressed(new WelcomeNotification('Hi')), ana);

    expect(mails.sent).toHaveLength(1);
    expect(mails.sent[0].message).toMatchObject({
      to: ['ana@example.com'],
      subject: 'Welcome',
      html: '<p>Hi</p>',
    });
  });

  it('sends nothing to a recipient with no address, or for a notification with no mail', async () => {
    const unreachable = new NotificationRecipient({
      notifiableType: 'users.User',
      notifiableId: 'bia',
    });

    await channels
      .named(EMAIL_CHANNEL)
      .deliver(new WelcomeNotification('Hi'), unreachable);
    await channels.named(EMAIL_CHANNEL).deliver(new SilentNotification(), ana);

    expect(mails.sent).toEqual([]);
  });

  it('fails when the transport does, so the delivery is retried', async () => {
    mails.failNext();

    await expect(
      channels.named(EMAIL_CHANNEL).deliver(new WelcomeNotification('Hi'), ana),
    ).rejects.toThrow('the transport is down');
  });
});

describe('the push channel', () => {
  const register = (token: string) =>
    inRequestContext(orm, () =>
      moduleRef
        .get(DeviceRepository)
        .save(Device.register({ token, deviceId: token }, ana, new Date())),
    );

  it('pushes to every device of the recipient', async () => {
    await register('phone');
    await register('laptop');

    await channels
      .named(PUSH_CHANNEL)
      .deliver(new WelcomeNotification('Hi'), ana);

    expect(push.sent).toHaveLength(1);
    expect([...push.sent[0].tokens].sort()).toEqual(['laptop', 'phone']);
    expect(push.sent[0].message.notification).toEqual({
      title: 'Welcome',
      body: 'Hi',
    });
  });

  it('pushes nothing to a recipient with no device', async () => {
    await channels
      .named(PUSH_CHANNEL)
      .deliver(new WelcomeNotification('Hi'), ana);

    expect(push.sent).toEqual([]);
  });

  it('fails only when no device received it', async () => {
    await register('phone');
    push.answer = (tokens) => ({
      delivered: 0,
      failed: tokens.map((token) => ({ token, reason: 'unregistered' })),
    });

    await expect(
      channels.named(PUSH_CHANNEL).deliver(new WelcomeNotification('Hi'), ana),
    ).rejects.toThrow(PushDeliveryFailedException);

    push.answer = (tokens) => ({ delivered: tokens.length, failed: [] });
  });
});
