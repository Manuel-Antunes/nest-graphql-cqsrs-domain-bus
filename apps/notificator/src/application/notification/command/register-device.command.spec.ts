import { CommandBus } from '@nestjs/cqrs';
import type { TestingModule } from '@nestjs/testing';
import { Device } from '@nestposts/notifications/domain/device/device.entity';
import { InvalidDeviceException } from '@nestposts/notifications/domain/device/exception/invalid-device.exception';
import { NotificationsInfrastructureModule } from '@nestposts/notifications/infrastructure/notifications-infrastructure.module';

import {
  createCqrsTestingModule,
  freshEm,
  inRequestContext,
} from '../../../../test/support/cqrs-testing-module';
import { aReader } from '../../../../test/support/reader-fixtures';
import { RegisterDeviceCommand } from './register-device.command';

describe('RegisterDeviceCommand.Handler', () => {
  let module: TestingModule;

  const execute = (command: RegisterDeviceCommand.RegisterDevice) =>
    inRequestContext(module, () => module.get(CommandBus).execute(command));

  const devices = () => freshEm(module).find(Device, {});

  beforeEach(async () => {
    module = await createCqrsTestingModule(
      [RegisterDeviceCommand.Handler],
      [NotificationsInfrastructureModule],
    );
  });

  afterEach(() => module.close());

  it('registers a push token for the user', async () => {
    const ana = aReader();

    const id = await execute(
      new RegisterDeviceCommand.RegisterDevice(
        { token: 'fcm-1', deviceId: 'pixel', platform: 'android' },
        ana,
      ),
    );

    const [device] = await devices();
    expect(device.id.equals(id)).toBe(true);
    expect(device).toMatchObject({ token: 'fcm-1', platform: 'android' });
    expect(device.isOwnedBy(ana)).toBe(true);
  });

  it('moves a token already known to whoever registers it now', async () => {
    const ana = aReader();
    const bia = aReader();
    const first = await execute(
      new RegisterDeviceCommand.RegisterDevice(
        { token: 'fcm-1', deviceId: 'pixel' },
        ana,
      ),
    );

    const again = await execute(
      new RegisterDeviceCommand.RegisterDevice(
        { token: 'fcm-1', deviceId: 'pixel' },
        bia,
      ),
    );

    const all = await devices();
    expect(again.equals(first)).toBe(true);
    expect(all).toHaveLength(1);
    expect(all[0].isOwnedBy(bia)).toBe(true);
  });

  it('refuses a device with no token', async () => {
    const ana = aReader();

    await expect(
      execute(
        new RegisterDeviceCommand.RegisterDevice(
          { token: ' ', deviceId: 'pixel' },
          ana,
        ),
      ),
    ).rejects.toThrow(InvalidDeviceException);
  });
});
