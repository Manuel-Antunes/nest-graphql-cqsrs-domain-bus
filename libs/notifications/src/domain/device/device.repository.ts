import type { Device } from './device.entity';
import type { DeviceId } from './vo/device-id';

export abstract class DeviceRepository {
  abstract save(device: Device): Promise<void>;
  abstract remove(device: Device): Promise<void>;
  abstract findById(id: DeviceId): Promise<Device | null>;
  abstract findByToken(token: string): Promise<Device | null>;
  abstract findByNotifiable(
    notifiableType: string,
    notifiableId: string,
  ): Promise<Device[]>;
}
