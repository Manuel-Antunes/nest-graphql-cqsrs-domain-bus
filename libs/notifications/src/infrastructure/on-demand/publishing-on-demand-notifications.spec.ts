import type { IEvent } from '@nestjs/cqrs';
import { EventBus } from '@nestjs/cqrs';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { CqsrsModule } from '@nestposts/cqsrs';

import { EMAIL_CHANNEL } from '../../domain/channel/channel-names';
import { NotificationReceivedEvent } from '../../domain/notification/event/notification-received.event';
import { Notification } from '../../domain/notification/notification';
import { NotificationType } from '../../domain/notification/notification-type';
import { OnDemandNotifiable } from '../../domain/notification/on-demand-notifiable';
import { OnDemandNotifications } from '../../domain/notification/on-demand-notifications';
import { PublishingOnDemandNotifications } from './publishing-on-demand-notifications';

@NotificationType('spec.Reset')
class ResetNotification extends Notification<{ url: string }> {
  constructor(url: string) {
    super({ url });
  }

  override via() {
    return [EMAIL_CHANNEL];
  }
}

describe('PublishingOnDemandNotifications', () => {
  let moduleRef: TestingModule;
  let published: IEvent[];

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [CqsrsModule.forRoot()],
      providers: [
        {
          provide: OnDemandNotifications,
          useClass: PublishingOnDemandNotifications,
        },
      ],
    }).compile();
    await moduleRef.init();
    published = [];
    moduleRef.get(EventBus).subscribe((event) => published.push(event));
  });

  afterEach(() => moduleRef.close());

  it('publishes the notification through the application event publisher before it resolves', async () => {
    const notifications = moduleRef.get(OnDemandNotifications);

    await notifications.send(
      OnDemandNotifiable.route(EMAIL_CHANNEL, 'ada@example.com'),
      new ResetNotification('https://example.com/reset'),
    );

    expect(published).toHaveLength(1);
    expect(published[0]).toBeInstanceOf(NotificationReceivedEvent);
    expect(published[0]).toMatchObject({
      notificationType: 'spec.Reset',
      notifiableId: 'ada@example.com',
      data: { url: 'https://example.com/reset' },
    });
  });

  it('publishes nothing when the notifiable refuses the notification', async () => {
    const notifications = moduleRef.get(OnDemandNotifications);

    await expect(
      notifications.send(
        OnDemandNotifiable.route('sms', '+5511999999999'),
        new ResetNotification('https://example.com/reset'),
      ),
    ).rejects.toThrow('"email"');
    expect(published).toHaveLength(0);
  });
});
