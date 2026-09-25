import { Inject, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { BillingAccounts } from '@nestposts/billing/domain/billing/billing-accounts';
import type { SubscriptionChange } from '@nestposts/billing/domain/billing/subscription-listener';
import { SubscriptionListener } from '@nestposts/billing/domain/billing/subscription-listener';
import { IdentityProvider } from '@nestposts/users/domain/user/identity.provider';
import { CredentialId } from '@nestposts/users/domain/user/vo/credential-id';

import { AUTHOR_ROLE } from '@/lib/auth/session';

@Injectable()
export class SubscriptionAuthorship extends SubscriptionListener {
  constructor(
    @Inject(ModuleRef) private readonly moduleRef: ModuleRef,
    @Inject(BillingAccounts) private readonly accounts: BillingAccounts,
  ) {
    super();
  }

  async onChange({ customerId }: SubscriptionChange): Promise<void> {
    const identities = this.moduleRef.get(IdentityProvider, { strict: false });
    const credential = CredentialId.parse(customerId);
    await ((await this.accounts.isSubscribed(customerId))
      ? identities.addRole(credential, AUTHOR_ROLE)
      : identities.removeRole(credential, AUTHOR_ROLE));
  }
}
