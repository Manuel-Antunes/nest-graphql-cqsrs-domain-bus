import { randomBytes } from 'node:crypto';
import { Webhook, WebhookVerificationError } from 'standardwebhooks';

import type { PolarSubscriptionChanges } from './polar-subscription-changes';
import { PolarWebhooks } from './polar-webhooks';

const standardSecret = () => `whsec_${randomBytes(24).toString('base64')}`;

const DASHBOARD_SECRET = 'polar_whs_dashboard-shaped-secret';

const signed = (signingKey: string, payload: object) => {
  const body = JSON.stringify(payload);
  const id = `msg_${randomBytes(6).toString('hex')}`;
  const timestamp = new Date();
  return {
    body,
    headers: {
      'webhook-id': id,
      'webhook-timestamp': String(Math.floor(timestamp.getTime() / 1000)),
      'webhook-signature': new Webhook(signingKey).sign(id, timestamp, body),
    },
  };
};

const changes = () => {
  const dispatch = vi.fn(async () => undefined);
  return {
    dispatch,
    changes: { dispatch } as unknown as PolarSubscriptionChanges,
  };
};

const checkoutCreated = {
  type: 'checkout.created',
  timestamp: new Date().toISOString(),
  data: {},
};

describe('PolarWebhooks', () => {
  it('verifies a secret in the Standard Webhooks form that Polar’s API hands out', async () => {
    const secret = standardSecret();
    const { dispatch, changes: listeners } = changes();
    const { body, headers } = signed(secret, checkoutCreated);

    await expect(
      new PolarWebhooks(secret, listeners).receive(body, headers),
    ).resolves.toBe('checkout.created');
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('verifies a secret written as plain text, the way Polar’s SDK reads one', async () => {
    const { changes: listeners } = changes();
    const { body, headers } = signed(
      Buffer.from(DASHBOARD_SECRET, 'utf-8').toString('base64'),
      checkoutCreated,
    );

    await expect(
      new PolarWebhooks(DASHBOARD_SECRET, listeners).receive(body, headers),
    ).resolves.toBe('checkout.created');
  });

  it('refuses a delivery signed with another secret, and tells no listener', async () => {
    const { dispatch, changes: listeners } = changes();
    const { body, headers } = signed(standardSecret(), {
      ...checkoutCreated,
      type: 'subscription.revoked',
    });

    await expect(
      new PolarWebhooks(standardSecret(), listeners).receive(body, headers),
    ).rejects.toBeInstanceOf(WebhookVerificationError);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('fails a signed subscription event it cannot read, so Polar delivers it again', async () => {
    const secret = standardSecret();
    const { dispatch, changes: listeners } = changes();
    const { body, headers } = signed(secret, {
      type: 'subscription.active',
      timestamp: new Date().toISOString(),
      data: { id: 'sub-1' },
    });

    await expect(
      new PolarWebhooks(secret, listeners).receive(body, headers),
    ).rejects.toThrow();
    expect(dispatch).not.toHaveBeenCalled();
  });
});
