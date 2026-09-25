import { z } from 'zod';

export const SubscriptionEventSchema = z.enum([
  'activated',
  'canceled',
  'revoked',
]);

export type SubscriptionEvent = z.infer<typeof SubscriptionEventSchema>;

export const SubscriptionChangeNotificationSchema = z.object({
  event: SubscriptionEventSchema,
  planName: z.string().min(1),
  endsAt: z.iso.datetime({ offset: true }).nullable(),
  url: z.url(),
});

export type SubscriptionChangeNotificationData = z.infer<
  typeof SubscriptionChangeNotificationSchema
>;
