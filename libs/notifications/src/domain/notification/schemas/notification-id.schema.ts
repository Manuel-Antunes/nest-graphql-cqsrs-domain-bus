import { z } from 'zod';

export const NotificationIdSchema = z.uuid().brand<'NotificationId'>();
