import { z } from 'zod';

import { NotificationId } from '../vo/notification-id';

export const NotificationRecordSchema = z.object({
  id: NotificationId.field(),
  type: z.string().min(1),
  notifiableType: z.string().min(1),
  notifiableId: z.string().min(1),
  data: z.record(z.string(), z.unknown()),
  readAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
