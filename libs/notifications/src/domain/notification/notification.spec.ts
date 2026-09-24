import { z } from 'zod';

import { DATABASE_CHANNEL, EMAIL_CHANNEL } from '../channel/channel-names';
import { InvalidNotificationException } from './exception/invalid-notification.exception';
import {
  NotificationTypeConflictException,
  NotificationTypeMissingException,
  UnknownNotificationTypeException,
} from './exception/notification-type.exception';
import type { INotifiable } from './notifiable';
import { Notification } from './notification';
import { NotificationRecord } from './notification-record.entity';
import {
  NotificationType,
  notificationClassFor,
  notificationTypeOf,
} from './notification-type';
import { NotificationId } from './vo/notification-id';

const GreetingSchema = z.object({ message: z.string().min(1) });

@NotificationType('spec.Greeting')
class GreetingNotification extends Notification<
  z.infer<typeof GreetingSchema>
> {
  static override readonly schema = GreetingSchema;
  constructed = true;

  constructor(message: string) {
    super({ message }, { key: message });
  }

  override via(): readonly string[] {
    return [DATABASE_CHANNEL, EMAIL_CHANNEL, DATABASE_CHANNEL];
  }
}

@NotificationType('spec.Plain')
class PlainNotification extends Notification {
  constructor() {
    super({ anything: 1 });
  }
}

const member: INotifiable = {
  notifiableType: 'spec.Member',
  notifiableId: 'member-1',
  notifiableName: 'Ana',
  routeNotificationFor: () => undefined,
};

describe('Notification', () => {
  it('keeps its data in a record of its declared type', () => {
    const notification = new GreetingNotification('hello');

    expect(notification.type).toBe('spec.Greeting');
    expect(notification.data).toEqual({ message: 'hello' });
    expect(notification.record).toBeInstanceOf(NotificationRecord);
    expect(notification.key).toBe('hello');
  });

  it('goes through the database alone unless it says otherwise', () => {
    expect(new PlainNotification().channelsFor(member)).toEqual([
      DATABASE_CHANNEL,
    ]);
  });

  it('lists each of its channels once', () => {
    expect(new GreetingNotification('hi').channelsFor(member)).toEqual([
      DATABASE_CHANNEL,
      EMAIL_CHANNEL,
    ]);
  });

  it('refuses data its schema does not accept', () => {
    expect(() => new GreetingNotification('')).toThrow(
      InvalidNotificationException,
    );
  });

  it('is rebuilt from its record by type, without running its constructor', () => {
    const record = NotificationRecord.restore({
      id: NotificationId.generate(),
      type: 'spec.Greeting',
      notifiableType: 'spec.Member',
      notifiableId: 'member-1',
      data: { message: 'from the wire' },
      readAt: null,
      createdAt: new Date('2026-09-01T00:00:00Z'),
    });

    const notification = Notification.restore(record);

    expect(notification).toBeInstanceOf(GreetingNotification);
    expect(notification.data).toEqual({ message: 'from the wire' });
    expect((notification as GreetingNotification).constructed).toBeUndefined();
    expect(notification.record).toBe(record);
  });

  it('refuses to rebuild a type nothing registered', () => {
    const record = NotificationRecord.draft('spec.Unregistered', {});

    expect(() => Notification.restore(record)).toThrow(
      UnknownNotificationTypeException,
    );
  });

  it('refuses to rebuild data the class would not have accepted', () => {
    const record = NotificationRecord.draft('spec.Greeting', { message: '' });

    expect(() => Notification.restore(record)).toThrow(
      InvalidNotificationException,
    );
  });
});

describe('@NotificationType', () => {
  it('finds a class by its type and a type by its class', () => {
    expect(notificationClassFor('spec.Greeting')).toBe(GreetingNotification);
    expect(notificationTypeOf(GreetingNotification)).toBe('spec.Greeting');
  });

  it('refuses two classes under one type', () => {
    expect(() => {
      @NotificationType('spec.Greeting')
      class Impostor extends PlainNotification {}
      return Impostor;
    }).toThrow(NotificationTypeConflictException);
  });

  it('refuses a notification that declared no type', () => {
    class Untyped extends Notification {
      constructor() {
        super({});
      }
    }

    expect(() => new Untyped()).toThrow(NotificationTypeMissingException);
  });
});
