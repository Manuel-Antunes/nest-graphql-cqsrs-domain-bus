import type { Subscription } from '@polar-sh/sdk/models/components/subscription.js';

import { BillingEvent } from '../../domain/billing/billing-event';
import type { SubscriptionEvent } from '../../domain/billing/schemas/subscription-change-notification.schema';
import type { SubscriptionChange } from '../../domain/billing/subscription-change';
import type { BillingEventService } from '../events/billing-event.service';

export class PolarSubscriptionChanges {
  constructor(private readonly events: BillingEventService) {}

  static changeOf(
    event: SubscriptionEvent,
    subscription: Subscription,
  ): SubscriptionChange | null {
    const customerId = subscription.customer.externalId;
    if (!customerId) {
      return null;
    }
    return {
      event,
      subscriptionId: subscription.id,
      customerId,
      customerEmail: subscription.customer.email ?? '',
      planId: subscription.productId,
      planName: subscription.product.name,
      endsAt: PolarSubscriptionChanges.endOf(event, subscription),
    };
  }

  async dispatch(
    event: SubscriptionEvent,
    subscription: Subscription,
  ): Promise<void> {
    const change = PolarSubscriptionChanges.changeOf(event, subscription);
    if (!change) {
      return;
    }
    await this.events.emit(BillingEvent.SUBSCRIPTION_CHANGED, change);
  }

  private static endOf(
    event: SubscriptionEvent,
    subscription: Subscription,
  ): Date | null {
    switch (event) {
      case 'activated':
        return null;
      case 'canceled':
        return subscription.endsAt ?? subscription.currentPeriodEnd;
      case 'revoked':
        return subscription.endedAt ?? subscription.endsAt ?? new Date();
    }
  }
}
