import { QueryBus } from '@nestjs/cqrs';
import type { TestingModule } from '@nestjs/testing';
import { NotificationRecord } from '@nestposts/notifications/domain/notification/notification-record.entity';
import { NotificationsInfrastructureModule } from '@nestposts/notifications/infrastructure/notifications-infrastructure.module';

import {
  createCqrsTestingModule,
  freshEm,
  inRequestContext,
} from '../../../../test/support/cqrs-testing-module';
import { givenANotification } from '../../../../test/support/notification-fixtures';
import { aReader } from '../../../../test/support/reader-fixtures';
import { CountUnreadNotificationsQuery } from './count-unread-notifications.query';
import { FindNotificationQuery } from './find-notification.query';
import { FindNotificationsQuery } from './find-notifications.query';

describe('the notification queries', () => {
  let module: TestingModule;

  const ask = <T>(query: object) =>
    inRequestContext(
      module,
      () => module.get(QueryBus).execute(query as never) as Promise<T>,
    );

  beforeEach(async () => {
    module = await createCqrsTestingModule(
      [
        FindNotificationsQuery.Handler,
        FindNotificationQuery.Handler,
        CountUnreadNotificationsQuery.Handler,
      ],
      [NotificationsInfrastructureModule],
    );
  });

  afterEach(() => module.close());

  it('lists the user’s notifications, newest first', async () => {
    const ana = aReader();
    const bia = aReader();
    const older = await givenANotification(module, ana, {
      at: new Date('2026-09-01'),
    });
    const newer = await givenANotification(module, ana, {
      at: new Date('2026-09-02'),
    });
    await givenANotification(module, bia);

    const found = await ask<{ id: { value: string } }[]>(
      new FindNotificationsQuery.FindNotifications(ana),
    );

    expect(found.map((record) => record.id.value)).toEqual([
      newer.id.value,
      older.id.value,
    ]);
  });

  it('answers one notification to its owner and nobody else', async () => {
    const ana = aReader();
    const bia = aReader();
    const notification = await givenANotification(module, ana);

    await expect(
      ask(new FindNotificationQuery.FindNotification(notification.id, ana)),
    ).resolves.toMatchObject({ type: 'posts.PostCreated' });
    await expect(
      ask(new FindNotificationQuery.FindNotification(notification.id, bia)),
    ).resolves.toBeNull();
  });

  it('counts only the owner’s unread notifications', async () => {
    const ana = aReader();
    const bia = aReader();
    await givenANotification(module, ana);
    const read = await givenANotification(module, ana);
    await givenANotification(module, bia);
    await freshEm(module).nativeUpdate(
      NotificationRecord,
      { id: read.id },
      { readAt: new Date() },
    );

    await expect(
      ask(new CountUnreadNotificationsQuery.CountUnreadNotifications(ana)),
    ).resolves.toBe(1);
  });
});
