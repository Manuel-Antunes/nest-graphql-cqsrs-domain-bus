import type { ICommandHandler } from '@nestjs/cqrs';
import { Command, CommandHandler } from '@nestjs/cqrs';
import { DeviceRepository } from '@nestposts/notifications/domain/device/device.repository';
import { DeviceNotOwnedException } from '@nestposts/notifications/domain/device/exception/device-not-owned.exception';
import type { INotifiable } from '@nestposts/notifications/domain/notification/notifiable';

export namespace RemoveDeviceCommand {
  export class RemoveDevice extends Command<boolean> {
    constructor(
      readonly token: string,
      readonly owner: Pick<INotifiable, 'notifiableType' | 'notifiableId'>,
    ) {
      super();
    }
  }

  @CommandHandler(RemoveDevice)
  export class Handler implements ICommandHandler<RemoveDevice> {
    constructor(private readonly devices: DeviceRepository) {}

    async execute({ token, owner }: RemoveDevice): Promise<boolean> {
      const device = await this.devices.findByToken(token.trim());
      if (!device) return false;
      if (!device.isOwnedBy(owner))
        throw new DeviceNotOwnedException(device.id);
      await this.devices.remove(device);
      return true;
    }
  }
}
