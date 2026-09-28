import { Inject, Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AUTHOR_ROLE } from '@nestposts/users/domain/user/author.entity';
import { IdentityProvider } from '@nestposts/users/domain/user/identity.provider';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';

import { BillingAccounts } from '../../domain/billing/billing-accounts';
import { BillingEvent } from '../../domain/billing/billing-event';
import type { SubscriptionChange } from '../../domain/billing/subscription-change';

@Injectable()
export class SubscriptionAuthorship {
  constructor(
    @Inject(BillingAccounts) private readonly accounts: BillingAccounts,
    @Inject(IdentityProvider) private readonly identities: IdentityProvider,
  ) {}

  @OnEvent(BillingEvent.SUBSCRIPTION_CHANGED, { suppressErrors: false })
  async onChange({ customerId }: SubscriptionChange): Promise<void> {
    const userId = UserId.parse(customerId);
    await ((await this.accounts.isSubscribed(customerId))
      ? this.identities.addRole(userId, AUTHOR_ROLE)
      : this.identities.removeRole(userId, AUTHOR_ROLE));
  }
}
