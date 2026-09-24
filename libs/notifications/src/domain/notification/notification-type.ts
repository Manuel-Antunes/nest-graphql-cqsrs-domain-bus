import type { Type } from '@nestjs/common';

import {
  NotificationTypeConflictException,
  NotificationTypeMissingException,
  UnknownNotificationTypeException,
} from './exception/notification-type.exception';

const NOTIFICATION_TYPE = Symbol.for(
  'nestposts.notifications.notification-type',
);

const byType = new Map<string, Type<unknown>>();

/**
 * The name a notification class is stored and delivered under — `posts.PostCreated`.
 *
 * It is what a {@link NotificationRecord} keeps in `type`, what travels in
 * `NotificationReceivedEvent`, and what the delivering process rebuilds the class from. Two classes
 * declaring one type throw at decoration time.
 */
export const NotificationType =
  (type: string): ClassDecorator =>
  (target) => {
    const existing = byType.get(type);
    if (existing && existing !== (target as unknown)) {
      throw new NotificationTypeConflictException(type);
    }
    byType.set(type, target as unknown as Type<unknown>);
    Object.defineProperty(target, NOTIFICATION_TYPE, {
      value: type,
      enumerable: false,
    });
  };

/** The type `klass` declared, or {@link NotificationTypeMissingException}. */
export const notificationTypeOf = (klass: object): string => {
  const type = (klass as { [NOTIFICATION_TYPE]?: string })[NOTIFICATION_TYPE];
  if (!type) {
    throw new NotificationTypeMissingException(
      (klass as { name?: string }).name ?? 'anonymous class',
    );
  }
  return type;
};

/** The class registered as `type`, or {@link UnknownNotificationTypeException}. */
export const notificationClassFor = <T>(type: string): Type<T> => {
  const klass = byType.get(type);
  if (!klass) throw new UnknownNotificationTypeException(type);
  return klass as Type<T>;
};

/** Every type registered in this process. */
export const registeredNotificationTypes = (): readonly string[] => [
  ...byType.keys(),
];
