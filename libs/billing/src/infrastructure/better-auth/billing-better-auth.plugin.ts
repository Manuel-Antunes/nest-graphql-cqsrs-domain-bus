import type { FactoryProvider } from '@nestjs/common';
import type { BetterAuthPlugin } from 'better-auth';
import { createAuthEndpoint, sessionMiddleware } from 'better-auth/api';
import { z } from 'zod';

import type { BillingCustomer } from '../../domain/billing/billing-accounts';
import { BillingAccounts } from '../../domain/billing/billing-accounts';
import { BillingCatalog } from '../../domain/billing/billing-catalog';
import { BILLING_BETTER_AUTH_PLUGIN } from '../tokens';

const PortalBody = z.object({
  returnUrl: z
    .string()
    .startsWith('/')
    .refine((path) => !path.startsWith('//')),
});

const customerOf = (user: {
  id: string;
  email: string;
  name: string;
}): BillingCustomer => ({ id: user.id, email: user.email, name: user.name });

export const billingBetterAuthPlugin = (
  catalog: BillingCatalog,
  accounts: BillingAccounts,
) =>
  ({
    id: 'nestposts-billing',
    endpoints: {
      billingPlans: createAuthEndpoint(
        '/billing/plans',
        { method: 'GET' },
        async (ctx) => ctx.json(await catalog.plans()),
      ),
      billingState: createAuthEndpoint(
        '/billing/state',
        { method: 'GET', use: [sessionMiddleware] },
        async (ctx) =>
          ctx.json(
            await accounts.stateOf(customerOf(ctx.context.session.user)),
          ),
      ),
      billingPortal: createAuthEndpoint(
        '/billing/portal',
        { method: 'POST', use: [sessionMiddleware], body: PortalBody },
        async (ctx) =>
          ctx.json({
            url: await accounts.portalFor(
              customerOf(ctx.context.session.user),
              new URL(ctx.body.returnUrl, ctx.context.baseURL).toString(),
            ),
          }),
      ),
    },
  }) satisfies BetterAuthPlugin;

export const BillingBetterAuthPluginProvider = {
  provide: BILLING_BETTER_AUTH_PLUGIN,
  useFactory: billingBetterAuthPlugin,
  inject: [BillingCatalog, BillingAccounts],
} satisfies FactoryProvider;
