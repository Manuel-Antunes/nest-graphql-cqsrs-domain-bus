import type { Polar } from '@polar-sh/sdk';
import { ResourceNotFound } from '@polar-sh/sdk/models/errors/resourcenotfound.js';

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

const polarWith = (overrides: Record<string, unknown> = {}) => {
  const polar = {
    customers: {
      getStateExternal: vi.fn(),
      getExternal: vi.fn(),
      create: vi.fn(),
    },
    ...overrides,
  };
  return polar as typeof polar & Polar;
};

describe('PolarBillingAccounts', () => {
  it('is subscribed while Polar lists an active subscription, and not before Polar knows the customer', async () => {
    const polar = polarWith();
    const accounts = new PolarBillingAccounts(polar);

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

  it('lets any other failure through, rather than calling it an unsubscribed customer', async () => {
    const polar = polarWith();
    polar.customers.getStateExternal.mockRejectedValue(
      new Error('polar is down'),
    );

    await expect(
      new PolarBillingAccounts(polar).isSubscribed('user-1'),
    ).rejects.toThrow('polar is down');
  });

  it('creates the customer Polar does not know yet, under the user id', async () => {
    const polar = polarWith();
    polar.customers.getExternal.mockRejectedValue(notFound());

    await new PolarBillingAccounts(polar).ensureCustomer(customer);

    expect(polar.customers.create).toHaveBeenCalledWith({
      externalId: 'user-1',
      email: 'manuel@example.com',
      name: 'Manuel',
    });
  });

  it('creates nothing for a customer that exists, and asks Polar about it once per process', async () => {
    const polar = polarWith();
    polar.customers.getExternal.mockResolvedValue({ id: 'polar-customer' });
    const accounts = new PolarBillingAccounts(polar);

    await accounts.ensureCustomer(customer);
    await accounts.ensureCustomer(customer);

    expect(polar.customers.create).not.toHaveBeenCalled();
    expect(polar.customers.getExternal).toHaveBeenCalledTimes(1);
  });

  it('lets a failure to ask Polar through, and asks again next time', async () => {
    const polar = polarWith();
    polar.customers.getExternal.mockRejectedValueOnce(
      new Error('polar is down'),
    );
    const accounts = new PolarBillingAccounts(polar);

    await expect(accounts.ensureCustomer(customer)).rejects.toThrow(
      'polar is down',
    );
    polar.customers.getExternal.mockResolvedValueOnce({ id: 'polar-customer' });
    await accounts.ensureCustomer(customer);

    expect(polar.customers.getExternal).toHaveBeenCalledTimes(2);
  });
});
