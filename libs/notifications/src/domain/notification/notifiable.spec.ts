import { AggregateRoot } from '@nestposts/platform/domain/shared/aggregate-root';
import { BaseEntity } from '@nestposts/platform/domain/shared/base-entity';
import type { DomainEvent } from '@nestposts/platform/domain/shared/domain-event';
import { eventTypeOf } from '@nestposts/platform/domain/shared/event-type';

import {
  DATABASE_CHANNEL,
  EMAIL_CHANNEL,
  PUSH_CHANNEL,
} from '../channel/channel-names';
import { NotificationReceivedEvent } from './event/notification-received.event';
import { Notifiable } from './notifiable';
import { Notification } from './notification';
import { NotificationType } from './notification-type';

class MemberId {
  constructor(readonly value: string) {}
  equals(other: unknown) {
    return other instanceof MemberId && other.value === this.value;
  }
}

class Member extends Notifiable(AggregateRoot(BaseEntity)<DomainEvent>) {
  id: MemberId;

  constructor(
    id: string,
    readonly email: string,
  ) {
    super();
    this.id = new MemberId(id);
  }

  override get notifiableType() {
    return 'spec.Member';
  }

  override get notifiableId() {
    return this.id.value;
  }

  override get notifiableName() {
    return 'Ana';
  }

  override routeNotificationFor(channel: string) {
    return channel === EMAIL_CHANNEL ? this.email : undefined;
  }
}

@NotificationType('spec.Invoice')
class InvoiceNotification extends Notification<{ number: string }> {
  constructor(number: string) {
    super({ number }, { key: number });
  }

  override via() {
    return [DATABASE_CHANNEL, EMAIL_CHANNEL, PUSH_CHANNEL];
  }
}

@NotificationType('spec.Ping')
class PingNotification extends Notification {
  constructor() {
    super({});
  }
}

const NOW = new Date('2026-09-23T12:00:00Z');

const receivedBy = (member: Member) =>
  member.getUncommittedEvents() as NotificationReceivedEvent[];

describe('Notifiable', () => {
  it('raises what a deliverer needs: the record, the channels and each route', () => {
    const member = new Member('member-1', 'ana@example.com');
    const notification = new InvoiceNotification('A-1');

    member.notify(notification, NOW);

    const [event] = receivedBy(member);
    expect(event).toBeInstanceOf(NotificationReceivedEvent);
    expect(event).toMatchObject({
      notificationId: notification.id.value,
      notificationType: 'spec.Invoice',
      notifiableType: 'spec.Member',
      notifiableId: 'member-1',
      data: { number: 'A-1' },
      channels: [DATABASE_CHANNEL, EMAIL_CHANNEL, PUSH_CHANNEL],
      recipient: {
        notifiableName: 'Ana',
        routes: { email: 'ana@example.com' },
      },
      occurredAt: NOW,
    });
  });

  it('addresses the notification record to the notifiable', () => {
    const member = new Member('member-1', 'ana@example.com');
    const notification = new InvoiceNotification('A-1');

    member.notify(notification, NOW);

    expect(notification.record.isAddressedTo('spec.Member', 'member-1')).toBe(
      true,
    );
    expect(notification.record.createdAt).toEqual(NOW);
    expect(notification.record.read).toBe(false);
  });

  it('names a keyed notification the same way every time it is sent to the same notifiable', () => {
    const first = new InvoiceNotification('A-1');
    const again = new InvoiceNotification('A-1');
    const toSomeoneElse = new InvoiceNotification('A-1');

    new Member('member-1', 'ana@example.com').notify(first, NOW);
    new Member('member-1', 'ana@example.com').notify(again, NOW);
    new Member('member-2', 'bia@example.com').notify(toSomeoneElse, NOW);

    expect(again.id.equals(first.id)).toBe(true);
    expect(toSomeoneElse.id.equals(first.id)).toBe(false);
  });

  it('gives an unkeyed notification an id of its own', () => {
    const member = new Member('member-1', 'ana@example.com');
    const first = new PingNotification();
    const second = new PingNotification();

    member.notify(first, NOW);
    member.notify(second, NOW);

    expect(first.id.equals(second.id)).toBe(false);
  });

  it('publishes under the notifications namespace, one stream per notification', () => {
    expect(eventTypeOf(NotificationReceivedEvent)).toMatchObject({
      namespace: 'notifications',
      name: 'NotificationReceived',
      tags: ['notificationId'],
    });
  });
});
