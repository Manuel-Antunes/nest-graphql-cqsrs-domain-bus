import { z } from 'zod';

import { AuthLinkNotificationSchema } from './auth-link-notification.schema';

export const EmailChangeNotificationSchema = AuthLinkNotificationSchema.extend({
  newEmail: z.email(),
});

export type EmailChangeNotificationData = z.infer<
  typeof EmailChangeNotificationSchema
>;
