import { z } from 'zod';

import { DevicePlatformSchema } from './device-platform.schema';

export const DEVICE_TOKEN_MAX_LENGTH = 4096;

export const NewDeviceSchema = z.object({
  token: z.string().trim().min(1).max(DEVICE_TOKEN_MAX_LENGTH),
  deviceId: z.string().trim().min(1).max(255),
  platform: DevicePlatformSchema.default('unknown'),
  meta: z.record(z.string(), z.unknown()).default({}),
});

export type NewDevice = z.input<typeof NewDeviceSchema>;
