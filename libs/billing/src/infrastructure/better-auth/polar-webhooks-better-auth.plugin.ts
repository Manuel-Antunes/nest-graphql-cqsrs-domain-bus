import type { FactoryProvider } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import type { BetterAuthPlugin } from 'better-auth';
import { APIError, createAuthEndpoint } from 'better-auth/api';
import { WebhookVerificationError } from 'standardwebhooks';

import type { SubscriptionListener } from '../../domain/billing/subscription-listener';
import type { BillingConfig } from '../billing.config';
import { PolarSubscriptionChanges } from '../polar/polar-subscription-changes';
import { PolarWebhooks } from '../polar/polar-webhooks';
import {
  BILLING_CONFIG,
  POLAR_WEBHOOKS_BETTER_AUTH_PLUGIN,
  SUBSCRIPTION_LISTENERS,
} from '../tokens';

const headersOf = (request: Request) => ({
  'webhook-id': request.headers.get('webhook-id') ?? '',
  'webhook-timestamp': request.headers.get('webhook-timestamp') ?? '',
  'webhook-signature': request.headers.get('webhook-signature') ?? '',
});

export const polarWebhooksBetterAuthPlugin = (
  config: BillingConfig,
  listeners: readonly SubscriptionListener[],
) => {
  if (!config.webhookSecret) {
    throw new Error('Polar webhooks need POLAR_WEBHOOK_SECRET');
  }
  const logger = new Logger(POLAR_WEBHOOKS_BETTER_AUTH_PLUGIN);
  const webhooks = new PolarWebhooks(
    config.webhookSecret,
    new PolarSubscriptionChanges(listeners),
  );

  return {
    id: 'nestposts-polar-webhooks',
    endpoints: {
      polarWebhooks: createAuthEndpoint(
        '/polar/webhooks',
        { method: 'POST', metadata: { isAction: false }, cloneRequest: true },
        async (ctx) => {
          if (!ctx.request) {
            throw new APIError('BAD_REQUEST');
          }
          const body = await ctx.request.text();
          try {
            const type = await webhooks.receive(body, headersOf(ctx.request));
            logger.log(`polar webhook ${type}`);
          } catch (error) {
            if (error instanceof WebhookVerificationError) {
              logger.warn(`polar webhook refused: ${error.message}`);
              throw new APIError('BAD_REQUEST', {
                message: `Webhook Error: ${error.message}`,
              });
            }
            logger.error('polar webhook failed', error);
            throw new APIError('BAD_REQUEST', {
              message: 'Webhook Error: see the server logs',
            });
          }
          return ctx.json({ received: true });
        },
      ),
    },
  } satisfies BetterAuthPlugin;
};

export const PolarWebhooksBetterAuthPluginProvider = {
  provide: POLAR_WEBHOOKS_BETTER_AUTH_PLUGIN,
  useFactory: polarWebhooksBetterAuthPlugin,
  inject: [BILLING_CONFIG, SUBSCRIPTION_LISTENERS],
} satisfies FactoryProvider;
