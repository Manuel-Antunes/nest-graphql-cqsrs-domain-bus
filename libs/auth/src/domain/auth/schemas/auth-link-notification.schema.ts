import { z } from 'zod';

export const AuthLinkNotificationSchema = z.object({
  url: z.url(),
  expiresInMinutes: z.number().int().positive(),
});

export type AuthLinkNotificationData = z.infer<
  typeof AuthLinkNotificationSchema
>;
