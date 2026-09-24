import type { DeviceId } from '../vo/device-id';

export class DeviceNotOwnedException extends Error {
  constructor(readonly deviceId: DeviceId) {
    super(`device ${deviceId} belongs to someone else`);
    this.name = 'DeviceNotOwnedException';
  }
}
