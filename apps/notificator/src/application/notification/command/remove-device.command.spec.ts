import { CommandBus } from '@nestjs/cqrs';
import type { TestingModule } from '@nestjs/testing';
import { Device } from '@nestposts/notifications/domain/device/device.entity';
import { DeviceNotOwnedException } from '@nestposts/notifications/domain/device/exception/device-not-owned.exception';
import { NotificationsInfrastructureModule } from '@nestposts/notifications/infrastructure/notifications-infrastructure.module';

import {
  createCqrsTestingModule,
  freshEm,
  inRequestContext,
} from '../../../../test/support/cqrs-testing-module';
import { aReader } from '../../../../test/support/reader-fixtures';
import { RemoveDeviceCommand } from './remove-device.command';

describe('RemoveDeviceCommand.Handler', () => {
  let module: TestingModule;

  const execute = (command: RemoveDeviceCommand.RemoveDevice) =>
    inRequestContext(module, () => module.get(CommandBus).execute(command));

  const givenADevice = async (owner: Parameters<typeof Device.register>[1]) => {
    const device = Device.register(
      { token: 'fcm-1', deviceId: 'pixel' },
      owner,
      new Date(),
    );
    await freshEm(module).persist(device).flush();
    return device;
  };

  beforeEach(async () => {
    module = await createCqrsTestingModule(
      [RemoveDeviceCommand.Handler],
      [NotificationsInfrastructureModule],
    );
  });

  afterEach(() => module.close());

  it('forgets the user’s own token', async () => {
    const ana = aReader();
    await givenADevice(ana);

    await expect(
      execute(new RemoveDeviceCommand.RemoveDevice('fcm-1', ana)),
    ).resolves.toBe(true);
    expect(await freshEm(module).find(Device, {})).toEqual([]);
  });

  it('answers false for a token nobody registered', async () => {
    const ana = aReader();

    await expect(
      execute(new RemoveDeviceCommand.RemoveDevice('fcm-1', ana)),
    ).resolves.toBe(false);
  });

  it('refuses to forget somebody else’s token', async () => {
    const ana = aReader();
    const bia = aReader();
    await givenADevice(ana);

    await expect(
      execute(new RemoveDeviceCommand.RemoveDevice('fcm-1', bia)),
    ).rejects.toThrow(DeviceNotOwnedException);
    expect(await freshEm(module).find(Device, {})).toHaveLength(1);
  });
});
