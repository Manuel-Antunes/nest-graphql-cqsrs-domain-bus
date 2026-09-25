import type { Subscription } from '@polar-sh/sdk/models/components/subscription.js';
import { WebhookSubscriptionActivePayload$inboundSchema } from '@polar-sh/sdk/models/components/webhooksubscriptionactivepayload.js';
import { WebhookSubscriptionCanceledPayload$inboundSchema } from '@polar-sh/sdk/models/components/webhooksubscriptioncanceledpayload.js';
import { WebhookSubscriptionRevokedPayload$inboundSchema } from '@polar-sh/sdk/models/components/webhooksubscriptionrevokedpayload.js';
import type { WebhookUnbrandedRequiredHeaders } from 'standardwebhooks';
import { Webhook } from 'standardwebhooks';

import type { SubscriptionEvent } from '../../domain/billing/schemas/subscription-change-notification.schema';
import type { PolarSubscriptionChanges } from './polar-subscription-changes';

const STANDARD_SECRET_PREFIX = 'whsec_';

interface SubscriptionPayload {
  event: SubscriptionEvent;
  schema: { parse(payload: unknown): { data: Subscription } };
}

const SUBSCRIPTION_PAYLOADS = new Map<string, SubscriptionPayload>([
  [
    'subscription.active',
    {
      event: 'activated',
      schema: WebhookSubscriptionActivePayload$inboundSchema,
    },
  ],
  [
    'subscription.canceled',
    {
      event: 'canceled',
      schema: WebhookSubscriptionCanceledPayload$inboundSchema,
    },
  ],
  [
    'subscription.revoked',
    {
      event: 'revoked',
      schema: WebhookSubscriptionRevokedPayload$inboundSchema,
    },
  ],
]);

export class PolarWebhooks {
  private readonly signature: Webhook;

  constructor(
    secret: string,
    private readonly changes: PolarSubscriptionChanges,
  ) {
    this.signature = new Webhook(
      secret.startsWith(STANDARD_SECRET_PREFIX)
        ? secret
        : Buffer.from(secret, 'utf-8').toString('base64'),
    );
  }

  async receive(
    body: string,
    headers: WebhookUnbrandedRequiredHeaders,
  ): Promise<string> {
    const payload = this.signature.verify(body, headers) as { type: string };
    const subscription = SUBSCRIPTION_PAYLOADS.get(payload.type);
    if (subscription) {
      const { data } = subscription.schema.parse(payload);
      await this.changes.dispatch(subscription.event, data);
    }
    return payload.type;
  }
}
