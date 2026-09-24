import { CommandBus } from '@nestjs/cqrs';
import type { TestingModule } from '@nestjs/testing';
import { NotificationNotFoundException } from '@nestposts/notifications/domain/notification/exception/notification-not-found.exception';
import { NotificationRecord } from '@nestposts/notifications/domain/notification/notification-record.entity';
import { NotificationId } from '@nestposts/notifications/domain/notification/vo/notification-id';
import { NotificationsInfrastructureModule } from '@nestposts/notifications/infrastructure/notifications-infrastructure.module';

import {
  createCqrsTestingModule,
  freshEm,
  inRequestContext,
} from '../../../../test/support/cqrs-testing-module';
import { givenANotification } from '../../../../test/support/notification-fixtures';
import { givenAUser } from '../../../../test/support/post-fixtures';
import { MarkNotificationAsReadCommand } from './mark-notification-as-read.command';

describe('MarkNotificationAsReadCommand.Handler', () => {
  let module: TestingModule;

  const execute = (
    command: MarkNotificationAsReadCommand.MarkNotificationAsRead,
  ) => inRequestContext(module, () => module.get(CommandBus).execute(command));

  const stored = (id: NotificationId) =>
    freshEm(module).findOneOrFail(NotificationRecord, { id });

  beforeEach(async () => {
    module = await createCqrsTestingModule(
      [MarkNotificationAsReadCommand.Handler],
      [NotificationsInfrastructureModule],
    );
  });

  afterEach(() => module.close());

  it('marks the reader’s own notification as read', async () => {
    const reader = await givenAUser(module);
    const notification = await givenANotification(module, reader);

    await execute(
      new MarkNotificationAsReadCommand.MarkNotificationAsRead(
        notification.id,
        reader,
      ),
    );

    expect((await stored(notification.id)).readAt).toBeInstanceOf(Date);
  });

  it('refuses somebody else’s notification as if it did not exist', async () => {
    const owner = await givenAUser(module);
    const intruder = await givenAUser(module);
    const notification = await givenANotification(module, owner);

    await expect(
      execute(
        new MarkNotificationAsReadCommand.MarkNotificationAsRead(
          notification.id,
          intruder,
        ),
      ),
    ).rejects.toThrow(NotificationNotFoundException);
    expect((await stored(notification.id)).readAt).toBeNull();
  });

  it('refuses a notification that does not exist', async () => {
    const reader = await givenAUser(module);

    await expect(
      execute(
        new MarkNotificationAsReadCommand.MarkNotificationAsRead(
          NotificationId.generate(),
          reader,
        ),
      ),
    ).rejects.toThrow(NotificationNotFoundException);
  });
});
