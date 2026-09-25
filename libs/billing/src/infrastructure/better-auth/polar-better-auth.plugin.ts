import type { FactoryProvider } from '@nestjs/common';
import { checkout, polar } from '@polar-sh/better-auth';
import { Polar } from '@polar-sh/sdk';
import type { BetterAuthPlugin } from 'better-auth';

import { BillingCatalog } from '../../domain/billing/billing-catalog';
import { POLAR_BETTER_AUTH_PLUGIN } from '../tokens';

export const polarBetterAuthPlugin = (
  client: Polar,
  catalog: BillingCatalog,
): BetterAuthPlugin =>
  polar({
    client,
    createCustomerOnSignUp: false,
    use: [
      checkout({
        products: async () =>
          (await catalog.plans()).map((plan) => ({
            productId: plan.id,
            slug: plan.id,
          })),
        authenticatedUsersOnly: true,
      }),
    ],
  });

export const PolarBetterAuthPluginProvider = {
  provide: POLAR_BETTER_AUTH_PLUGIN,
  useFactory: polarBetterAuthPlugin,
  inject: [Polar, BillingCatalog],
} satisfies FactoryProvider;
