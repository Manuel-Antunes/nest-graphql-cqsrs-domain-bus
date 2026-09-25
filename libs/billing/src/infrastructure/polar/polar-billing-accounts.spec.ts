import type { Polar } from '@polar-sh/sdk';
import { ResourceNotFound } from '@polar-sh/sdk/models/errors/resourcenotfound.js';

import type { BillingCatalog } from '../../domain/billing/billing-catalog';
import { PolarBillingAccounts } from './polar-billing-accounts';

const customer = { id: 'user-1', email: 'manuel@example.com', name: 'Manuel' };

const notFound = () =>
  new ResourceNotFound(
    { error: 'ResourceNotFound', detail: 'Not found' },
    {
      response: new Response(null, { status: 404 }),
      request: new Request('https://api.polar.sh/v1/customers'),
      body: '',
    },
  );

const pagesOf = <T>(items: T[]) => ({
  async *[Symbol.asyncIterator]() {
    yield { result: { items } };
  },
});

const polarWith = (overrides: Record<string, unknown> = {}) => {
  const polar = {
    customers: {
      getStateExternal: vi.fn(),
      getExternal: vi.fn(),
      create: vi.fn(),
    },
    customerSessions: {
      create: vi.fn(async () => ({
        customerPortalUrl: 'https://polar.sh/portal/session',
      })),
    },
    meters: {
      list: vi.fn(async () =>
        pagesOf([{ id: 'meter-1', name: 'tokens', customLabel: 'Tokens' }]),
      ),
    },
    ...overrides,
  };
  return polar as typeof polar & Polar;
};

const catalog: BillingCatalog = {
  plans: async () => [
    {
      id: 'pro',
      name: 'Pro',
      prices: [{ id: 'p', amount: 1000, currency: 'brl', interval: 'month' }],
    },
  ],
};

describe('PolarBillingAccounts', () => {
  it('answers no subscription for a user Polar does not know, without creating the customer', async () => {
    const polar = polarWith();
    polar.customers.getStateExternal.mockRejectedValue(notFound());

    const state = await new PolarBillingAccounts(polar, catalog).stateOf(
      customer,
    );

    expect(state).toEqual({ usage: [] });
    expect(polar.customers.create).not.toHaveBeenCalled();
    expect(polar.customerSessions.create).not.toHaveBeenCalled();
  });

  it('reads the active subscription as the plan it is for, and the meters under their labels', async () => {
    const polar = polarWith();
    const renews = new Date('2026-10-24T00:00:00Z');
    polar.customers.getStateExternal.mockResolvedValue({
      activeSubscriptions: [
        {
          id: 'sub-1',
          productId: 'pro',
          status: 'active',
          recurringInterval: 'month',
          currentPeriodEnd: renews,
          cancelAtPeriodEnd: false,
          canceledAt: null,
        },
      ],
      activeMeters: [
        { meterId: 'meter-1', consumedUnits: 30, creditedUnits: 100 },
      ],
    });

    const state = await new PolarBillingAccounts(polar, catalog).stateOf(
      customer,
    );

    expect(state).toEqual({
      subscription: {
        id: 'sub-1',
        planId: 'pro',
        planName: 'Pro',
        interval: 'month',
        status: 'active',
        currentPeriodEnd: renews,
        cancelAtPeriodEnd: false,
      },
      usage: [{ id: 'meter-1', label: 'Tokens', used: 30, limit: 100 }],
    });
  });

  it('lets any other failure through, rather than calling it an empty account', async () => {
    const polar = polarWith();
    polar.customers.getStateExternal.mockRejectedValue(
      new Error('polar is down'),
    );

    await expect(
      new PolarBillingAccounts(polar, catalog).stateOf(customer),
    ).rejects.toThrow('polar is down');
  });

  it('is subscribed while Polar lists an active subscription, and not before Polar knows the customer', async () => {
    const polar = polarWith();
    const accounts = new PolarBillingAccounts(polar, catalog);

    polar.customers.getStateExternal.mockRejectedValueOnce(notFound());
    await expect(accounts.isSubscribed('user-1')).resolves.toBe(false);

    polar.customers.getStateExternal.mockResolvedValueOnce({
      activeSubscriptions: [],
      activeMeters: [],
    });
    await expect(accounts.isSubscribed('user-1')).resolves.toBe(false);

    polar.customers.getStateExternal.mockResolvedValueOnce({
      activeSubscriptions: [{ id: 'sub-1', status: 'active' }],
      activeMeters: [],
    });
    await expect(accounts.isSubscribed('user-1')).resolves.toBe(true);
    expect(polar.customers.getStateExternal).toHaveBeenLastCalledWith({
      externalId: 'user-1',
    });
  });

  it('creates the customer when the portal is asked for and Polar does not know them yet', async () => {
    const polar = polarWith();
    polar.customers.getExternal.mockRejectedValue(notFound());

    const url = await new PolarBillingAccounts(polar, catalog).portalFor(
      customer,
      'http://localhost:4200/settings/billing',
    );

    expect(polar.customers.create).toHaveBeenCalledWith({
      externalId: 'user-1',
      email: 'manuel@example.com',
      name: 'Manuel',
    });
    expect(polar.customerSessions.create).toHaveBeenCalledWith({
      externalCustomerId: 'user-1',
      returnUrl: 'http://localhost:4200/settings/billing',
    });
    expect(url).toBe('https://polar.sh/portal/session');
  });

  it('opens the portal of an existing customer without creating another', async () => {
    const polar = polarWith();
    polar.customers.getExternal.mockResolvedValue({ id: 'polar-customer' });

    await new PolarBillingAccounts(polar, catalog).portalFor(
      customer,
      'http://localhost:4200/settings/billing',
    );

    expect(polar.customers.create).not.toHaveBeenCalled();
  });
});
