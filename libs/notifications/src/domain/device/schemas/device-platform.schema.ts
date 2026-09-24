import { z } from 'zod';

export const DevicePlatformSchema = z.enum([
  'ios',
  'android',
  'web',
  'unknown',
]);

export type DevicePlatform = z.infer<typeof DevicePlatformSchema>;
