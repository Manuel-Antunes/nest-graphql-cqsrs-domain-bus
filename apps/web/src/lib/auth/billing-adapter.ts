'use client';

import type {
  BillingActionResult,
  BillingAdapter,
  BillingPlan,
  BillingState,
  BillingSubscription,
} from '@better-auth-ui/core/plugins/billing';
import { createPolarBillingAdapter } from '@better-auth-ui/core/plugins/billing';

import { authClient } from '@/lib/auth-client';

import { BILLING_SETTINGS_PATH } from './views';

type SerializedSubscription = Omit<
  BillingSubscription,
  'currentPeriodEnd' | 'canceledAt'
> & { currentPeriodEnd?: string; canceledAt?: string };

type SerializedState = Omit<BillingState, 'subscription'> & {
  subscription?: SerializedSubscription;
};

const RETURN_PATH = `/settings/${BILLING_SETTINGS_PATH}`;

const dateOf = (value: string | undefined) =>
  value ? new Date(value) : undefined;

const stateOf = ({ subscription, usage }: SerializedState): BillingState => ({
  usage,
  ...(subscription
    ? {
        subscription: {
          ...subscription,
          currentPeriodEnd: dateOf(subscription.currentPeriodEnd),
          canceledAt: dateOf(subscription.canceledAt),
        },
      }
    : {}),
});

const request = async <T>(
  path: string,
  init: { method: 'GET' | 'POST'; body?: object; signal?: AbortSignal },
): Promise<T> => {
  const { data, error } = await authClient.$fetch<T>(path, init);
  if (error) {
    throw new Error(error.message || error.statusText);
  }
  return data as T;
};

const openPortal = () =>
  request<BillingActionResult>('/billing/portal', {
    method: 'POST',
    body: { returnUrl: RETURN_PATH },
  });

export const billingAdapter: BillingAdapter = {
  ...createPolarBillingAdapter(authClient, {
    plans: [],
    successUrl: RETURN_PATH,
    cancelUrl: RETURN_PATH,
    returnUrl: RETURN_PATH,
  }),
  scopes: { user: true, organization: false },
  listPlans: (_scope, signal) =>
    request<BillingPlan[]>('/billing/plans', { method: 'GET', signal }),
  getState: async (_scope, signal) =>
    stateOf(
      await request<SerializedState>('/billing/state', {
        method: 'GET',
        signal,
      }),
    ),
  openPortal,
  cancel: openPortal,
  restore: openPortal,
  updateSeats: openPortal,
};
