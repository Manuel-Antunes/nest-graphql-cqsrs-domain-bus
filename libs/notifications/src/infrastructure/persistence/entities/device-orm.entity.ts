import { defineEntity, p, valueObjectType } from '@nestposts/database';

import { Device } from '../../../domain/device/device.entity';
import type { DevicePlatform } from '../../../domain/device/schemas/device-platform.schema';
import { DEVICE_TOKEN_MAX_LENGTH } from '../../../domain/device/schemas/new-device.schema';
import { DeviceId } from '../../../domain/device/vo/device-id';

const DeviceIdType = valueObjectType(DeviceId, { columnType: 'varchar(36)' });

export const DeviceEntitySchema = defineEntity({
  class: Device,
  tableName: 'devices',
  forceConstructor: true,
  properties: {
    id: p.type(DeviceIdType).primary(),
    token: p.string().length(DEVICE_TOKEN_MAX_LENGTH).unique(),
    deviceId: p.string(),
    platform: p.string().$type<DevicePlatform>(),
    meta: p.json<Record<string, unknown>>(),
    notifiableType: p.string(),
    notifiableId: p.string(),
    createdAt: p.datetime(),
    updatedAt: p.datetime(),
  },
  indexes: [{ properties: ['notifiableType', 'notifiableId'] }],
});
