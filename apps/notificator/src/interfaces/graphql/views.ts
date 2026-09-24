import type { Device } from '@nestposts/notifications/domain/device/device.entity';
import type { NotificationRecord } from '@nestposts/notifications/domain/notification/notification-record.entity';

export interface NotificationView {
  id: string;
  type: string;
  data: Record<string, unknown>;
  read: boolean;
  readAt: Date | null;
  createdAt: Date;
}

export interface DeviceView {
  id: string;
  deviceId: string;
  platform: string;
  createdAt: Date;
}

export const notificationView = (
  record: NotificationRecord,
): NotificationView => ({
  id: record.id.value,
  type: record.type,
  data: record.data,
  read: record.read,
  readAt: record.readAt,
  createdAt: record.createdAt,
});

export const deviceView = (device: Device): DeviceView => ({
  id: device.id.value,
  deviceId: device.deviceId,
  platform: device.platform,
  createdAt: device.createdAt,
});
