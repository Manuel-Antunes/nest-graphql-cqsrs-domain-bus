import type { FactoryProvider } from '@nestjs/common';
import { checkout, polar, portal, usage } from '@polar-sh/better-auth';
import { Polar } from '@polar-sh/sdk';

import type { BillingConfig } from '../../config/billing.config';
import { billingConfig } from '../../config/billing.config';
import { BillingCatalog } from '../../domain/billing/billing-catalog';
import { POLAR_BETTER_AUTH_PLUGIN } from '../tokens';

export type PolarBetterAuthPlugin = ReturnType<typeof polar>;

export const polarBetterAuthPlugin = (
  client: Polar,
  catalog: BillingCatalog,
  { settingsUrl }: BillingConfig,
): PolarBetterAuthPlugin =>
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
      portal({ returnUrl: settingsUrl }),
      usage(),
    ],
  });

export const PolarBetterAuthPluginProvider = {
  provide: POLAR_BETTER_AUTH_PLUGIN,
  useFactory: polarBetterAuthPlugin,
  inject: [Polar, BillingCatalog, billingConfig.KEY],
} satisfies FactoryProvider;
