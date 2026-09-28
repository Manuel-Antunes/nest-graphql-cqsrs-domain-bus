import type { FactoryProvider } from '@nestjs/common';
import {
  ORGANIZATION_ADMIN_ROLE,
  OWNER_ROLE,
} from '@nestposts/organizations/domain/organization/schemas/member-role.schema';
import type { BetterAuthPlugin } from 'better-auth';
import {
  APIError,
  createAuthEndpoint,
  createAuthMiddleware,
  getSessionFromCtx,
  requireOrgRole,
} from 'better-auth/api';

import { BillingAccounts } from '../../domain/billing/billing-accounts';
import { BillingCatalog } from '../../domain/billing/billing-catalog';
import { BILLING_BETTER_AUTH_PLUGIN } from '../tokens';

const PURCHASE_PATH = '/checkout';

const REFERENCED_PATHS = new Set([
  PURCHASE_PATH,
  '/customer/subscriptions/list',
]);

const CUSTOMER_PATHS = ['/customer/', '/usage/'];

const purchasingForAnOrganization = requireOrgRole({
  orgIdParam: 'referenceId',
  orgIdSource: 'body',
  allowedRoles: [OWNER_ROLE, ORGANIZATION_ADMIN_ROLE],
});

const readingAnOrganization = requireOrgRole({
  orgIdParam: 'referenceId',
  orgIdSource: 'query',
});

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
    },
    hooks: {
      before: [
        {
          matcher: (ctx) => REFERENCED_PATHS.has(ctx.path ?? ''),
          handler: createAuthMiddleware(async (ctx) => {
            const purchase = ctx.path === PURCHASE_PATH;
            const referenceId = (purchase ? ctx.body : ctx.query)?.referenceId;
            if (!referenceId) {
              return;
            }
            const session = await getSessionFromCtx(ctx);
            if (!session) {
              throw new APIError('UNAUTHORIZED');
            }
            if (referenceId === session.user.id) {
              return;
            }
            const authorize = purchase
              ? purchasingForAnOrganization
              : readingAnOrganization;
            await authorize({
              ...ctx,
              context: { ...ctx.context, session },
            } as Parameters<typeof authorize>[0]);
          }),
        },
        {
          matcher: (ctx) =>
            CUSTOMER_PATHS.some((path) => ctx.path?.startsWith(path)),
          handler: createAuthMiddleware(async (ctx) => {
            const session = await getSessionFromCtx(ctx);
            if (session) {
              const { id, email, name } = session.user;
              await accounts.ensureCustomer({ id, email, name });
            }
          }),
        },
      ],
    },
  }) satisfies BetterAuthPlugin;

export const BillingBetterAuthPluginProvider = {
  provide: BILLING_BETTER_AUTH_PLUGIN,
  useFactory: billingBetterAuthPlugin,
  inject: [BillingCatalog, BillingAccounts],
} satisfies FactoryProvider;
