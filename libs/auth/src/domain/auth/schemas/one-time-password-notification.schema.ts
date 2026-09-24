import { z } from 'zod';

import { OneTimePasswordPurposeSchema } from './one-time-password-purpose.schema';

export const OneTimePasswordNotificationSchema = z.object({
  code: z.string().min(4).max(12),
  purpose: OneTimePasswordPurposeSchema,
  expiresInMinutes: z.number().int().positive(),
});

export type OneTimePasswordNotificationData = z.infer<
  typeof OneTimePasswordNotificationSchema
>;
