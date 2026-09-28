import type { SubscriptionChange } from './subscription-change';

export enum BillingEvent {
  SUBSCRIPTION_CHANGED = 'billing.subscription_changed',
}

export interface BillingEventPayloads {
  [BillingEvent.SUBSCRIPTION_CHANGED]: SubscriptionChange;
}
