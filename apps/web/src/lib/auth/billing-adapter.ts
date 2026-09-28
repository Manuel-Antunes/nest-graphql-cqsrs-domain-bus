'use client';

import type {
  BillingAdapter,
  BillingPlan,
} from '@better-auth-ui/core/plugins/billing';
import { createPolarBillingAdapter } from '@better-auth-ui/core/plugins/billing';

import { authClient } from '@/lib/auth-client';

import { BILLING_SETTINGS_PATH } from './views';

const RETURN_PATH = `/settings/${BILLING_SETTINGS_PATH}`;

export const billingAdapter: BillingAdapter = {
  ...createPolarBillingAdapter(authClient, {
    plans: [],
    successUrl: RETURN_PATH,
    cancelUrl: RETURN_PATH,
    returnUrl: RETURN_PATH,
  }),
  scopes: { user: true, organization: true },
  listPlans: async (_scope, signal) => {
    const { data, error } = await authClient.$fetch<BillingPlan[]>(
      '/billing/plans',
      { method: 'GET', signal },
    );
    if (error) {
      throw new Error(error.message || error.statusText);
    }
    return data as BillingPlan[];
  },
};
