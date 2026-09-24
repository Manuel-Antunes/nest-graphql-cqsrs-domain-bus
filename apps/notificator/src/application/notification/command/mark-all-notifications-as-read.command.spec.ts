import { CommandBus } from '@nestjs/cqrs';
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
import { MarkAllNotificationsAsReadCommand } from './mark-all-notifications-as-read.command';

describe('MarkAllNotificationsAsReadCommand.Handler', () => {
  let module: TestingModule;

  const execute = (
    command: MarkAllNotificationsAsReadCommand.MarkAllNotificationsAsRead,
  ) =>
    inRequestContext(
      module,
      () => module.get(CommandBus).execute(command) as Promise<number>,
    );

  const unreadOf = (notifiableId: string) =>
    freshEm(module).count(NotificationRecord, { notifiableId, readAt: null });

  beforeEach(async () => {
    module = await createCqrsTestingModule(
      [MarkAllNotificationsAsReadCommand.Handler],
      [NotificationsInfrastructureModule],
    );
  });

  afterEach(() => module.close());

  it('marks every unread notification of the reader, answers how many, and touches nobody else’s', async () => {
    const reader = aReader();
    const other = aReader();
    await givenANotification(module, reader, { at: new Date('2026-09-01') });
    await givenANotification(module, reader, { at: new Date('2026-09-02') });
    await givenANotification(module, other);

    await expect(
      execute(
        new MarkAllNotificationsAsReadCommand.MarkAllNotificationsAsRead(
          reader,
        ),
      ),
    ).resolves.toBe(2);

    await expect(unreadOf(reader.notifiableId)).resolves.toBe(0);
    await expect(unreadOf(other.notifiableId)).resolves.toBe(1);
  });

  it('answers zero when there is nothing left to read', async () => {
    const reader = aReader();

    await expect(
      execute(
        new MarkAllNotificationsAsReadCommand.MarkAllNotificationsAsRead(
          reader,
        ),
      ),
    ).resolves.toBe(0);
  });
});
