import { Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EMAIL_CHANNEL } from '@nestposts/notifications/domain/channel/channel-names';
import { OnDemandNotifiable } from '@nestposts/notifications/domain/notification/on-demand-notifiable';
import { OnDemandNotifications } from '@nestposts/notifications/domain/notification/on-demand-notifications';
import { UserRepository } from '@nestposts/users/domain/user/user.repository';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';

import type { BillingConfig } from '../../config/billing.config';
import { billingConfig } from '../../config/billing.config';
import { BillingEvent } from '../../domain/billing/billing-event';
import { SubscriptionChangeNotification } from '../../domain/billing/notification/subscription-change.notification';
import type { SubscriptionChange } from '../../domain/billing/subscription-change';

@Injectable()
export class SubscriptionEmails {
  constructor(
    @Inject(UserRepository) private readonly users: UserRepository,
    @Inject(OnDemandNotifications)
    private readonly notifications: OnDemandNotifications,
    @Inject(billingConfig.KEY) private readonly config: BillingConfig,
  ) {}

  @OnEvent(BillingEvent.SUBSCRIPTION_CHANGED, { suppressErrors: false })
  async onChange(change: SubscriptionChange): Promise<void> {
    const user = await this.users.findById(UserId.parse(change.customerId));
    const address = user?.email.value ?? change.customerEmail;
    if (!address) {
      return;
    }
    await this.notifications.send(
      OnDemandNotifiable.route(
        EMAIL_CHANNEL,
        address,
        user?.name.value ?? null,
      ),
      SubscriptionChangeNotification.of(change, this.config.settingsUrl),
    );
  }
}
