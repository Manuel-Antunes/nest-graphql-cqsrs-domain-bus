import type { TestingModule } from '@nestjs/testing';
import type { INotifiable } from '@nestposts/notifications/domain/notification/notifiable';
import { NotificationRecord } from '@nestposts/notifications/domain/notification/notification-record.entity';

import { freshEm } from './cqrs-testing-module';
import { T0 } from './post-fixtures';

export async function givenANotification(
  module: TestingModule,
  notifiable: Pick<INotifiable, 'notifiableType' | 'notifiableId'>,
  overrides: { at?: Date; data?: Record<string, unknown> } = {},
): Promise<NotificationRecord> {
  const record = NotificationRecord.draft(
    'posts.PostCreated',
    overrides.data ?? { title: 'Hello' },
  );
  record.addressTo(
    {
      notifiableType: notifiable.notifiableType,
      notifiableId: notifiable.notifiableId,
      notifiableName: null,
      routeNotificationFor: () => undefined,
    },
    overrides.at ?? T0,
  );
  await freshEm(module).persist(record).flush();
  return record;
}
