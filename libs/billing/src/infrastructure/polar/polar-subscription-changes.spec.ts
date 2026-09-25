import type { Subscription } from '@polar-sh/sdk/models/components/subscription.js';

import type {
  SubscriptionChange,
  SubscriptionListener,
} from '../../domain/billing/subscription-listener';
import { PolarSubscriptionChanges } from './polar-subscription-changes';

const periodEnd = new Date('2026-10-24T00:00:00Z');

const subscription = (overrides: Partial<Subscription> = {}): Subscription =>
  ({
    id: 'sub-1',
    productId: 'pro',
    product: { id: 'pro', name: 'Pro' },
    customer: { externalId: 'user-1', email: 'ada@mailinator.com' },
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: false,
    endsAt: null,
    endedAt: null,
    ...overrides,
  }) as Subscription;

const recorder = () => {
  const changes: SubscriptionChange[] = [];
  const listener: SubscriptionListener = {
    onChange: async (change) => {
      changes.push(change);
    },
  };
  return { changes, listener };
};

describe('PolarSubscriptionChanges', () => {
  it('turns an activation into a change for the user the customer belongs to', () => {
    expect(
      PolarSubscriptionChanges.changeOf('activated', subscription()),
    ).toEqual({
      event: 'activated',
      subscriptionId: 'sub-1',
      customerId: 'user-1',
      customerEmail: 'ada@mailinator.com',
      planId: 'pro',
      planName: 'Pro',
      endsAt: null,
    });
  });

  it('dates a cancellation at the end of the period it stays active for', () => {
    expect(
      PolarSubscriptionChanges.changeOf(
        'canceled',
        subscription({ cancelAtPeriodEnd: true }),
      )?.endsAt,
    ).toEqual(periodEnd);
  });

  it('dates a revocation at the moment it ended', () => {
    const ended = new Date('2026-09-24T12:00:00Z');
    expect(
      PolarSubscriptionChanges.changeOf(
        'revoked',
        subscription({ endedAt: ended }),
      )?.endsAt,
    ).toEqual(ended);
  });

  it('hands every change to every listener', async () => {
    const first = recorder();
    const second = recorder();

    await new PolarSubscriptionChanges([
      first.listener,
      second.listener,
    ]).dispatch('revoked', subscription());

    expect(first.changes.map(({ event }) => event)).toEqual(['revoked']);
    expect(second.changes).toEqual(first.changes);
  });

  it('ignores a customer this application did not create', async () => {
    const { changes, listener } = recorder();

    await new PolarSubscriptionChanges([listener]).dispatch(
      'activated',
      subscription({
        customer: {
          externalId: null,
          email: 'x@y.z',
        } as Subscription['customer'],
      }),
    );

    expect(changes).toEqual([]);
  });

  it('fails when a listener fails, so Polar delivers the event again', async () => {
    const failing: SubscriptionListener = {
      onChange: async () => {
        throw new Error('the mail transport is down');
      },
    };

    await expect(
      new PolarSubscriptionChanges([failing]).dispatch(
        'activated',
        subscription(),
      ),
    ).rejects.toThrow('the mail transport is down');
  });
});
