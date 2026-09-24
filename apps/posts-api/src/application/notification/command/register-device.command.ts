import type { ICommandHandler } from '@nestjs/cqrs';
import { Command, CommandHandler } from '@nestjs/cqrs';
import { Device } from '@nestposts/notifications/domain/device/device.entity';
import { DeviceRepository } from '@nestposts/notifications/domain/device/device.repository';
import type { NewDevice } from '@nestposts/notifications/domain/device/schemas/new-device.schema';
import type { DeviceId } from '@nestposts/notifications/domain/device/vo/device-id';
import type { INotifiable } from '@nestposts/notifications/domain/notification/notifiable';

export namespace RegisterDeviceCommand {
  export class RegisterDevice extends Command<DeviceId> {
    constructor(
      readonly device: NewDevice,
      readonly owner: Pick<INotifiable, 'notifiableType' | 'notifiableId'>,
    ) {
      super();
    }
  }

  @CommandHandler(RegisterDevice)
  export class Handler implements ICommandHandler<RegisterDevice> {
    constructor(private readonly devices: DeviceRepository) {}

    async execute({ device, owner }: RegisterDevice): Promise<DeviceId> {
      const now = new Date();
      const known = await this.devices.findByToken(device.token.trim());
      if (known) {
        known.reassign(device, owner, now);
        await this.devices.save(known);
        return known.id;
      }
      const registered = Device.register(device, owner, now);
      await this.devices.save(registered);
      return registered.id;
    }
  }
}
