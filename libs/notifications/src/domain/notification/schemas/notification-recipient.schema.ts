import { z } from 'zod';

export const NotificationRecipientSchema = z.object({
  notifiableType: z.string().min(1),
  notifiableId: z.string().min(1),
  notifiableName: z.string().nullable().default(null),
  routes: z.record(z.string(), z.string()).default({}),
});

export type NotificationRecipientInput = z.input<
  typeof NotificationRecipientSchema
>;
