import type { SubscriptionEvent } from '../domain/billing/schemas/subscription-change-notification.schema';

export const SUBSCRIPTION_CHANGE_SUBJECTS: Record<SubscriptionEvent, string> = {
  activated: 'Your subscription is active',
  canceled: 'Your subscription was canceled',
  revoked: 'Your subscription has ended',
};
