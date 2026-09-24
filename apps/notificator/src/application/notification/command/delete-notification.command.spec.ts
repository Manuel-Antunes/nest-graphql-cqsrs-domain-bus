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
import { aReader } from '../../../../test/support/reader-fixtures';
import { DeleteNotificationCommand } from './delete-notification.command';

describe('DeleteNotificationCommand.Handler', () => {
  let module: TestingModule;

  const execute = (command: DeleteNotificationCommand.DeleteNotification) =>
    inRequestContext(module, () => module.get(CommandBus).execute(command));

  const stored = (id: NotificationId) =>
    freshEm(module).findOne(NotificationRecord, { id });

  beforeEach(async () => {
    module = await createCqrsTestingModule(
      [DeleteNotificationCommand.Handler],
      [NotificationsInfrastructureModule],
    );
  });

  afterEach(() => module.close());

  it('deletes the owner’s notification for good', async () => {
    const owner = aReader();
    const notification = await givenANotification(module, owner);

    await execute(
      new DeleteNotificationCommand.DeleteNotification(notification.id, owner),
    );

    await expect(stored(notification.id)).resolves.toBeNull();
  });

  it('refuses somebody else’s notification as if it did not exist, and keeps it', async () => {
    const owner = aReader();
    const intruder = aReader();
    const notification = await givenANotification(module, owner);

    await expect(
      execute(
        new DeleteNotificationCommand.DeleteNotification(
          notification.id,
          intruder,
        ),
      ),
    ).rejects.toThrow(NotificationNotFoundException);
    await expect(stored(notification.id)).resolves.not.toBeNull();
  });

  it('refuses a notification that does not exist', async () => {
    const owner = aReader();

    await expect(
      execute(
        new DeleteNotificationCommand.DeleteNotification(
          NotificationId.generate(),
          owner,
        ),
      ),
    ).rejects.toThrow(NotificationNotFoundException);
  });
});
