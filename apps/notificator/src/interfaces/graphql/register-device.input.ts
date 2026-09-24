import { NewDeviceSchema } from '@nestposts/notifications/domain/device/schemas/new-device.schema';

export const RegisterDeviceInputSchema = NewDeviceSchema.pick({
  token: true,
  deviceId: true,
  platform: true,
});
