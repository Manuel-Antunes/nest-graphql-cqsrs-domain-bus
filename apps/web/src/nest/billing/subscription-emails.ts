import { Inject, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { SubscriptionChangeNotification } from '@nestposts/billing/domain/billing/notification/subscription-change.notification';
import type { SubscriptionChange } from '@nestposts/billing/domain/billing/subscription-listener';
import { SubscriptionListener } from '@nestposts/billing/domain/billing/subscription-listener';
import { EMAIL_CHANNEL } from '@nestposts/notifications/domain/channel/channel-names';
import { OnDemandNotifiable } from '@nestposts/notifications/domain/notification/on-demand-notifiable';
import { OnDemandNotifications } from '@nestposts/notifications/domain/notification/on-demand-notifications';
import { IdentityProvider } from '@nestposts/users/domain/user/identity.provider';
import { CredentialId } from '@nestposts/users/domain/user/vo/credential-id';

import { BILLING_SETTINGS_PATH } from '@/lib/auth/views';

import type { AppConfig } from '../config/app.config';
import { appConfig } from '../config/app.config';

@Injectable()
export class SubscriptionEmails extends SubscriptionListener {
  constructor(
    @Inject(ModuleRef) private readonly moduleRef: ModuleRef,
    @Inject(appConfig.KEY) private readonly app: AppConfig,
  ) {
    super();
  }

  async onChange(change: SubscriptionChange): Promise<void> {
    const identity = await this.moduleRef
      .get(IdentityProvider, { strict: false })
      .findById(CredentialId.parse(change.customerId));
    const address = identity?.email.value ?? change.customerEmail;
    if (!address) {
      return;
    }
    await this.moduleRef
      .get(OnDemandNotifications, { strict: false })
      .send(
        OnDemandNotifiable.route(
          EMAIL_CHANNEL,
          address,
          identity?.name.value ?? null,
        ),
        SubscriptionChangeNotification.of(
          change,
          new URL(
            `/settings/${BILLING_SETTINGS_PATH}`,
            this.app.url,
          ).toString(),
        ),
      );
  }
}
