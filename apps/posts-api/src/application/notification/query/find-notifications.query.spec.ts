import { QueryBus } from '@nestjs/cqrs';
import type { TestingModule } from '@nestjs/testing';
import { NotificationsInfrastructureModule } from '@nestposts/notifications/infrastructure/notifications-infrastructure.module';

import {
  createCqrsTestingModule,
  inRequestContext,
} from '../../../../test/support/cqrs-testing-module';
import { givenANotification } from '../../../../test/support/notification-fixtures';
import { givenAUser } from '../../../../test/support/post-fixtures';
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
      [FindNotificationsQuery.Handler, FindNotificationQuery.Handler],
      [NotificationsInfrastructureModule],
    );
  });

  afterEach(() => module.close());

  it('lists the user’s notifications, newest first', async () => {
    const ana = await givenAUser(module);
    const bia = await givenAUser(module);
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
    const ana = await givenAUser(module);
    const bia = await givenAUser(module);
    const notification = await givenANotification(module, ana);

    await expect(
      ask(new FindNotificationQuery.FindNotification(notification.id, ana)),
    ).resolves.toMatchObject({ type: 'posts.PostCreated' });
    await expect(
      ask(new FindNotificationQuery.FindNotification(notification.id, bia)),
    ).resolves.toBeNull();
  });
});
