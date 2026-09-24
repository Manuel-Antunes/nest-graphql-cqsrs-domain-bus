import { BaseEntity } from '@nestposts/platform/domain/shared/base-entity';

import type { INotifiable } from '../notification/notifiable';
import { InvalidDeviceException } from './exception/invalid-device.exception';
import type { DevicePlatform } from './schemas/device-platform.schema';
import type { NewDevice } from './schemas/new-device.schema';
import { NewDeviceSchema } from './schemas/new-device.schema';
import { DeviceId } from './vo/device-id';

interface DeviceState {
  id: DeviceId;
  token: string;
  deviceId: string;
  platform: DevicePlatform;
  meta: Record<string, unknown>;
  notifiableType: string;
  notifiableId: string;
}

/**
 * Where a notifiable receives push notifications: one token per app installation.
 *
 * It belongs to a notifiable by kind and id rather than by foreign key, the way a
 * {@link NotificationRecord} does, because the notifiable's table belongs to another module.
 */
export class Device extends BaseEntity<DeviceState> {
  id!: DeviceId;
  token!: string;
  deviceId!: string;
  platform!: DevicePlatform;
  meta!: Record<string, unknown>;
  notifiableType!: string;
  notifiableId!: string;

  static register(
    input: NewDevice,
    owner: Pick<INotifiable, 'notifiableType' | 'notifiableId'>,
    now: Date,
  ): Device {
    const device = new Device({
      id: DeviceId.generate(),
      ...Device.parse(input),
      notifiableType: owner.notifiableType,
      notifiableId: owner.notifiableId,
    });
    device.stampCreation(now);
    return device;
  }

  private static parse(input: NewDevice) {
    const parsed = NewDeviceSchema.safeParse(input);
    if (!parsed.success) {
      throw new InvalidDeviceException(
        `invalid device: ${parsed.error.message}`,
        {
          cause: parsed.error,
        },
      );
    }
    return parsed.data;
  }

  isOwnedBy(
    owner: Pick<INotifiable, 'notifiableType' | 'notifiableId'>,
  ): boolean {
    return (
      this.notifiableType === owner.notifiableType &&
      this.notifiableId === owner.notifiableId
    );
  }

  /** The same token signed in as someone else: the installation now notifies them. */
  reassign(
    input: NewDevice,
    owner: Pick<INotifiable, 'notifiableType' | 'notifiableId'>,
    now: Date,
  ): void {
    const parsed = Device.parse(input);
    this.deviceId = parsed.deviceId;
    this.platform = parsed.platform;
    this.meta = parsed.meta;
    this.notifiableType = owner.notifiableType;
    this.notifiableId = owner.notifiableId;
    this.touch(now);
  }
}
