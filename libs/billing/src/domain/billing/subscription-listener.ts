import type { SubscriptionEvent } from './schemas/subscription-change-notification.schema';

export interface SubscriptionChange {
  event: SubscriptionEvent;
  subscriptionId: string;
  customerId: string;
  customerEmail: string;
  planId: string;
  planName: string;
  endsAt: Date | null;
}

export abstract class SubscriptionListener {
  abstract onChange(change: SubscriptionChange): Promise<void>;
}
