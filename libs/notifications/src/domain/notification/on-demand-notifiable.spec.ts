import {
  DATABASE_CHANNEL,
  EMAIL_CHANNEL,
  PUSH_CHANNEL,
} from '../channel/channel-names';
import { NotificationReceivedEvent } from './event/notification-received.event';
import { UnroutableNotificationException } from './exception/unroutable-notification.exception';
import { Notification } from './notification';
import { NotificationType } from './notification-type';
import {
  ON_DEMAND_NOTIFIABLE_TYPE,
  OnDemandNotifiable,
} from './on-demand-notifiable';

@NotificationType('spec.Welcome')
class WelcomeNotification extends Notification<{ url: string }> {
  constructor(url: string, key?: string) {
    super({ url }, { key });
  }

  override via() {
    return [EMAIL_CHANNEL];
  }
}

@NotificationType('spec.Stored')
class StoredNotification extends Notification {
  constructor() {
    super({});
  }
}

@NotificationType('spec.Everywhere')
class EverywhereNotification extends Notification {
  constructor() {
    super({});
  }

  override via() {
    return [EMAIL_CHANNEL, PUSH_CHANNEL];
  }
}

const NOW = new Date('2026-09-24T12:00:00Z');

describe('OnDemandNotifiable', () => {
  it('is notified like an aggregate, addressed by the route it was given', () => {
    const ada = OnDemandNotifiable.route(
      EMAIL_CHANNEL,
      'ada@example.com',
      'Ada',
    );
    const welcome = new WelcomeNotification('https://example.com/verify');

    ada.notify(welcome, NOW);

    const [event] = ada.getUncommittedEvents();
    expect(event).toBeInstanceOf(NotificationReceivedEvent);
    expect(event).toMatchObject({
      notificationId: welcome.id.value,
      notificationType: 'spec.Welcome',
      notifiableType: ON_DEMAND_NOTIFIABLE_TYPE,
      notifiableId: 'ada@example.com',
      data: { url: 'https://example.com/verify' },
      channels: [EMAIL_CHANNEL],
      recipient: {
        notifiableName: 'Ada',
        routes: { email: 'ada@example.com' },
      },
      occurredAt: NOW,
    });
  });

  it('refuses the database channel, because there is nobody to keep the record against', () => {
    const ada = OnDemandNotifiable.route(EMAIL_CHANNEL, 'ada@example.com');

    expect(() => ada.notify(new StoredNotification(), NOW)).toThrow(
      UnroutableNotificationException,
    );
    expect(() => ada.notify(new StoredNotification(), NOW)).toThrow(
      `"${DATABASE_CHANNEL}"`,
    );
    expect(ada.getUncommittedEvents()).toHaveLength(0);
  });

  it('refuses a channel it has no route for rather than delivering half of the notification', () => {
    const ada = OnDemandNotifiable.route(EMAIL_CHANNEL, 'ada@example.com');

    expect(() => ada.notify(new EverywhereNotification(), NOW)).toThrow(
      `"${PUSH_CHANNEL}"`,
    );
  });

  it('goes through every channel it was routed on', () => {
    const ada = OnDemandNotifiable.route(
      EMAIL_CHANNEL,
      'ada@example.com',
    ).route(PUSH_CHANNEL, 'device-token');

    ada.notify(new EverywhereNotification(), NOW);

    expect(ada.getUncommittedEvents()[0]).toMatchObject({
      channels: [EMAIL_CHANNEL, PUSH_CHANNEL],
      recipient: {
        routes: { email: 'ada@example.com', push: 'device-token' },
      },
    });
  });

  it('keys a notification by its address, so sending it again is the same notification', () => {
    const first = new WelcomeNotification('https://example.com/a', 'invite-1');
    const again = new WelcomeNotification('https://example.com/a', 'invite-1');

    OnDemandNotifiable.route(EMAIL_CHANNEL, 'ada@example.com').notify(first);
    OnDemandNotifiable.route(EMAIL_CHANNEL, 'ada@example.com').notify(again);

    expect(again.id.value).toBe(first.id.value);
  });
});
