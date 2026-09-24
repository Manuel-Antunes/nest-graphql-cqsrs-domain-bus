import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import {
  DatabaseModule,
  inRequestContext,
  MikroORM,
} from '@nestposts/database';
import type { AnyMikroORM } from '@nestposts/database/testing';
import {
  TestSchemaModule,
  tableIn,
  testDatabaseConfig,
} from '@nestposts/database/testing';

import { NotificationDelivery } from '../domain/delivery/notification-delivery';
import { NotificationDeliveryRepository } from '../domain/delivery/notification-delivery.repository';
import { Device } from '../domain/device/device.entity';
import { DeviceRepository } from '../domain/device/device.repository';
import { NotificationRecord } from '../domain/notification/notification-record.entity';
import { NotificationRecordRepository } from '../domain/notification/notification-record.repository';
import { NotificationId } from '../domain/notification/vo/notification-id';
import {
  NotificationsInfrastructureModule,
  notificationsEntities,
} from './notifications-infrastructure.module';

let moduleRef: TestingModule;
let orm: AnyMikroORM;
let records: NotificationRecordRepository;
let deliveries: NotificationDeliveryRepository;
let devices: DeviceRepository;

const ana = {
  notifiableType: 'users.User',
  notifiableId: 'ana',
  notifiableName: 'Ana',
  routeNotificationFor: () => undefined,
};

const recordFor = (at: string, data: Record<string, unknown> = {}) => {
  const record = NotificationRecord.draft('spec.Thing', data);
  record.addressTo(ana, new Date(at));
  return record;
};

beforeAll(async () => {
  moduleRef = await Test.createTestingModule({
    imports: [
      DatabaseModule.forRoot({
        ...testDatabaseConfig(
          { entities: notificationsEntities },
          'notifications',
        ),
        exclusive: true,
      }),
      TestSchemaModule.forRoot(),
      NotificationsInfrastructureModule,
    ],
  }).compile();
  await moduleRef.init();
  orm = moduleRef.get(MikroORM);
  records = moduleRef.get(NotificationRecordRepository);
  deliveries = moduleRef.get(NotificationDeliveryRepository);
  devices = moduleRef.get(DeviceRepository);
});

afterAll(() => moduleRef?.close());

beforeEach(async () => {
  await orm.em
    .getConnection()
    .execute(
      `truncate table ${['notifications', 'notification_deliveries', 'devices']
        .map((name) => tableIn(orm, name))
        .join(', ')}`,
    );
});

const inContext = <T>(work: () => Promise<T>) => inRequestContext(orm, work);

describe('NotificationRecordRepository', () => {
  it('stores a record once however many times it is delivered', async () => {
    const record = recordFor('2026-09-23T12:00:00Z', { title: 'Hello' });

    await expect(records.saveIfAbsent(record)).resolves.toBe(true);
    await expect(
      records.saveIfAbsent(recordFor('2026-09-23T12:00:00Z')),
    ).resolves.toBe(true);
    await expect(records.saveIfAbsent(record)).resolves.toBe(false);

    const stored = await orm.em
      .fork()
      .findOneOrFail(NotificationRecord, { id: record.id });
    expect(stored).toMatchObject({
      type: 'spec.Thing',
      notifiableType: 'users.User',
      notifiableId: 'ana',
      data: { title: 'Hello' },
      readAt: null,
    });
    expect(stored.id.equals(record.id)).toBe(true);
  });

  it('lists a notifiable’s notifications newest first, and the unread ones alone', async () => {
    const older = recordFor('2026-09-01T00:00:00Z');
    const newer = recordFor('2026-09-02T00:00:00Z');
    await records.saveIfAbsent(older);
    await records.saveIfAbsent(newer);
    await inContext(async () => {
      const read = await records.findById(older.id);
      read?.markAsRead(new Date('2026-09-03T00:00:00Z'));
      await records.save(read as NotificationRecord);
    });

    const all = await records.findByNotifiable('users.User', 'ana');
    const unread = await records.findByNotifiable('users.User', 'ana', {
      unreadOnly: true,
    });
    const someoneElse = await records.findByNotifiable('users.User', 'bia');

    expect(all.map((record) => record.id.value)).toEqual([
      newer.id.value,
      older.id.value,
    ]);
    expect(unread.map((record) => record.id.value)).toEqual([newer.id.value]);
    expect(someoneElse).toEqual([]);
  });

  it('answers nothing for an id it does not have', async () => {
    await expect(
      records.findById(NotificationId.generate()),
    ).resolves.toBeNull();
  });

  it('counts and finds every unread notification of a notifiable, and marks them all in one go', async () => {
    const unread = Array.from({ length: 3 }, (_, index) =>
      recordFor(`2026-09-0${index + 1}T00:00:00Z`),
    );
    const read = recordFor('2026-09-05T00:00:00Z');
    read.markAsRead(new Date('2026-09-06T00:00:00Z'));
    for (const record of [...unread, read]) {
      await records.saveIfAbsent(record);
    }

    await expect(records.countUnread('users.User', 'ana')).resolves.toBe(3);
    await expect(records.countUnread('users.User', 'bia')).resolves.toBe(0);

    await inContext(async () => {
      const found = await records.findUnreadByNotifiable('users.User', 'ana');
      expect(found.map((record) => record.id.value).sort()).toEqual(
        unread.map((record) => record.id.value).sort(),
      );
      for (const record of found) {
        record.markAsRead(new Date('2026-09-07T00:00:00Z'));
      }
      await records.saveAll(found);
    });

    await expect(records.countUnread('users.User', 'ana')).resolves.toBe(0);
  });

  it('removes a record for good, and leaves the delivery ledger as it was', async () => {
    const record = recordFor('2026-09-23T12:00:00Z');
    await records.saveIfAbsent(record);
    await deliveries.record(
      NotificationDelivery.of(record.id, 'database', new Date()),
    );

    await inContext(async () => {
      const stored = await records.findById(record.id);
      await records.remove(stored as NotificationRecord);
    });

    await expect(records.findById(record.id)).resolves.toBeNull();
    await expect(deliveries.deliveredChannels(record.id)).resolves.toEqual(
      new Set(['database']),
    );
  });
});

describe('NotificationDeliveryRepository', () => {
  it('remembers each channel a notification was delivered through, once', async () => {
    const id = NotificationId.generate();
    const at = new Date('2026-09-23T12:00:00Z');

    await deliveries.record(NotificationDelivery.of(id, 'database', at));
    await deliveries.record(NotificationDelivery.of(id, 'email', at));
    await deliveries.record(NotificationDelivery.of(id, 'email', at));

    await expect(deliveries.deliveredChannels(id)).resolves.toEqual(
      new Set(['database', 'email']),
    );
    await expect(
      deliveries.deliveredChannels(NotificationId.generate()),
    ).resolves.toEqual(new Set());
  });
});

describe('DeviceRepository', () => {
  it('finds a device by token and every device of a notifiable', async () => {
    const now = new Date('2026-09-23T12:00:00Z');
    const phone = Device.register(
      { token: 'phone', deviceId: 'p', platform: 'ios' },
      ana,
      now,
    );
    const laptop = Device.register(
      { token: 'laptop', deviceId: 'l', platform: 'web' },
      ana,
      now,
    );
    await inContext(() => devices.save(phone));
    await inContext(() => devices.save(laptop));

    await expect(devices.findByToken('phone')).resolves.toMatchObject({
      platform: 'ios',
    });
    await expect(
      devices.findByNotifiable('users.User', 'ana'),
    ).resolves.toHaveLength(2);

    await inContext(async () =>
      devices.remove((await devices.findById(phone.id)) as Device),
    );

    await expect(devices.findByToken('phone')).resolves.toBeNull();
  });
});
