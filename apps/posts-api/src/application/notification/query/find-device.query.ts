import type { IQueryHandler } from '@nestjs/cqrs';
import { Query, QueryHandler } from '@nestjs/cqrs';
import type { Device } from '@nestposts/notifications/domain/device/device.entity';
import { DeviceRepository } from '@nestposts/notifications/domain/device/device.repository';
import type { DeviceId } from '@nestposts/notifications/domain/device/vo/device-id';

export namespace FindDeviceQuery {
  export class FindDevice extends Query<Device | null> {
    constructor(readonly deviceId: DeviceId) {
      super();
    }
  }

  @QueryHandler(FindDevice)
  export class Handler implements IQueryHandler<FindDevice> {
    constructor(private readonly devices: DeviceRepository) {}

    execute({ deviceId }: FindDevice): Promise<Device | null> {
      return this.devices.findById(deviceId);
    }
  }
}
