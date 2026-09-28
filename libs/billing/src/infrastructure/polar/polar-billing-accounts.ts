import { Inject, Injectable } from '@nestjs/common';
import { Polar } from '@polar-sh/sdk';
import { ResourceNotFound } from '@polar-sh/sdk/models/errors/resourcenotfound.js';

import type { BillingCustomer } from '../../domain/billing/billing-accounts';
import { BillingAccounts } from '../../domain/billing/billing-accounts';

@Injectable()
export class PolarBillingAccounts extends BillingAccounts {
  private readonly known = new Set<string>();

  constructor(@Inject(Polar) private readonly polar: Polar) {
    super();
  }

  async isSubscribed(customerId: string): Promise<boolean> {
    try {
      const state = await this.polar.customers.getStateExternal({
        externalId: customerId,
      });
      return state.activeSubscriptions.length > 0;
    } catch (error) {
      if (error instanceof ResourceNotFound) {
        return false;
      }
      throw error;
    }
  }

  async ensureCustomer(customer: BillingCustomer): Promise<void> {
    if (this.known.has(customer.id)) {
      return;
    }
    try {
      await this.polar.customers.getExternal({ externalId: customer.id });
    } catch (error) {
      if (!(error instanceof ResourceNotFound)) {
        throw error;
      }
      await this.polar.customers.create({
        externalId: customer.id,
        email: customer.email,
        name: customer.name,
      });
    }
    this.known.add(customer.id);
  }
}
