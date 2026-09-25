import type { PlanInterval } from './plan';

export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'paused'
  | 'canceled'
  | 'incomplete'
  | 'unknown';

export interface BillingSubscription {
  id: string;
  planId: string;
  planName?: string;
  interval?: PlanInterval;
  status: SubscriptionStatus;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd?: boolean;
  canceledAt?: Date;
}

export interface BillingUsage {
  id: string;
  label: string;
  used: number;
  limit?: number;
}

export interface BillingState {
  subscription?: BillingSubscription;
  usage: BillingUsage[];
}

export const NO_BILLING_STATE: BillingState = { usage: [] };
