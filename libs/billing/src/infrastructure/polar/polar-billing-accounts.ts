import { Inject, Injectable } from '@nestjs/common';
import { Polar } from '@polar-sh/sdk';
import type { CustomerState } from '@polar-sh/sdk/models/components/customerstate.js';
import type { CustomerStateSubscription } from '@polar-sh/sdk/models/components/customerstatesubscription.js';
import type { Meter } from '@polar-sh/sdk/models/components/meter.js';
import { ResourceNotFound } from '@polar-sh/sdk/models/errors/resourcenotfound.js';

import type { BillingCustomer } from '../../domain/billing/billing-accounts';
import { BillingAccounts } from '../../domain/billing/billing-accounts';
import { BillingCatalog } from '../../domain/billing/billing-catalog';
import type {
  BillingState,
  BillingSubscription,
  SubscriptionStatus,
} from '../../domain/billing/billing-state';
import { NO_BILLING_STATE } from '../../domain/billing/billing-state';
import type { Plan } from '../../domain/billing/plan';
import { ExpiringValue } from './expiring-value';

const METERS_TTL_MS = 5 * 60_000;
const PAGE_SIZE = 100;

@Injectable()
export class PolarBillingAccounts extends BillingAccounts {
  private readonly meterNames = new ExpiringValue(METERS_TTL_MS, () =>
    this.loadMeterNames(),
  );

  constructor(
    @Inject(Polar) private readonly polar: Polar,
    @Inject(BillingCatalog) private readonly catalog: BillingCatalog,
  ) {
    super();
  }

  async stateOf(customer: BillingCustomer): Promise<BillingState> {
    const state = await this.customerState(customer.id);
    if (!state) {
      return NO_BILLING_STATE;
    }

    const [plans, meterNames] = await Promise.all([
      this.catalog.plans(),
      this.meterNames.get(),
    ]);
    const [subscription] = state.activeSubscriptions;

    return {
      ...(subscription
        ? { subscription: this.subscriptionOf(subscription, plans) }
        : {}),
      usage: state.activeMeters.map((meter) => ({
        id: meter.meterId,
        label: meterNames.get(meter.meterId) ?? meter.meterId,
        used: meter.consumedUnits,
        ...(meter.creditedUnits > 0 ? { limit: meter.creditedUnits } : {}),
      })),
    };
  }

  async isSubscribed(customerId: string): Promise<boolean> {
    const state = await this.customerState(customerId);
    return (state?.activeSubscriptions.length ?? 0) > 0;
  }

  async portalFor(
    customer: BillingCustomer,
    returnUrl: string,
  ): Promise<string> {
    await this.ensureCustomer(customer);
    const session = await this.polar.customerSessions.create({
      externalCustomerId: customer.id,
      returnUrl,
    });
    return session.customerPortalUrl;
  }

  private async customerState(
    externalId: string,
  ): Promise<CustomerState | null> {
    try {
      return await this.polar.customers.getStateExternal({ externalId });
    } catch (error) {
      if (error instanceof ResourceNotFound) {
        return null;
      }
      throw error;
    }
  }

  private async ensureCustomer(customer: BillingCustomer): Promise<void> {
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
  }

  private subscriptionOf(
    subscription: CustomerStateSubscription,
    plans: readonly Plan[],
  ): BillingSubscription {
    const plan = plans.find(({ id }) => id === subscription.productId);
    const interval = PolarBillingAccounts.intervalOf(
      subscription.recurringInterval,
    );

    return {
      id: subscription.id,
      planId: subscription.productId,
      ...(plan ? { planName: plan.name } : {}),
      ...(interval ? { interval } : {}),
      status: PolarBillingAccounts.statusOf(subscription.status),
      currentPeriodEnd: subscription.currentPeriodEnd,
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      ...(subscription.canceledAt
        ? { canceledAt: subscription.canceledAt }
        : {}),
    };
  }

  private static intervalOf(interval: string): 'month' | 'year' | null {
    if (interval === 'month') {
      return 'month';
    }
    return interval === 'year' ? 'year' : null;
  }

  private static statusOf(status: string): SubscriptionStatus {
    switch (status) {
      case 'active':
      case 'trialing':
      case 'past_due':
      case 'canceled':
      case 'incomplete':
        return status;
      case 'incomplete_expired':
        return 'incomplete';
      case 'unpaid':
        return 'past_due';
      default:
        return 'unknown';
    }
  }

  private async loadMeterNames(): Promise<ReadonlyMap<string, string>> {
    const meters: Meter[] = [];
    const pages = await this.polar.meters.list({ limit: PAGE_SIZE });
    for await (const page of pages) {
      meters.push(...page.result.items);
    }
    return new Map(
      meters.map((meter) => [meter.id, meter.customLabel || meter.name]),
    );
  }
}
