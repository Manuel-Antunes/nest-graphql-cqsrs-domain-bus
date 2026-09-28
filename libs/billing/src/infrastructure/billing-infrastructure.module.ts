import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UsersInfrastructureModule } from '@nestposts/users/infrastructure/users-infrastructure.module';
import { Polar } from '@polar-sh/sdk';

import type { BillingConfig } from '../config/billing.config';
import { billingConfig } from '../config/billing.config';
import { BillingAccounts } from '../domain/billing/billing-accounts';
import { BillingCatalog } from '../domain/billing/billing-catalog';
import { BillingService } from './better-auth/billing.service';
import { BillingBetterAuthPluginProvider } from './better-auth/billing-better-auth.plugin';
import { PolarBetterAuthPluginProvider } from './better-auth/polar-better-auth.plugin';
import { PolarWebhooksBetterAuthPluginProvider } from './better-auth/polar-webhooks-better-auth.plugin';
import { BillingEventService } from './events/billing-event.service';
import { SubscriptionAuthorship } from './listeners/subscription-authorship.listener';
import { SubscriptionEmails } from './listeners/subscription-emails.listener';
import { PolarBillingAccounts } from './polar/polar-billing-accounts';
import { PolarBillingCatalog } from './polar/polar-billing-catalog';

const billingConfiguration = ConfigModule.forFeature(billingConfig);

@Module({
  imports: [billingConfiguration, UsersInfrastructureModule],
  providers: [
    {
      provide: Polar,
      useFactory: ({ polar }: BillingConfig) =>
        new Polar({ accessToken: polar?.accessToken, server: polar?.server }),
      inject: [billingConfig.KEY],
    },
    { provide: BillingCatalog, useClass: PolarBillingCatalog },
    { provide: BillingAccounts, useClass: PolarBillingAccounts },
    BillingEventService,
    BillingService,
    SubscriptionAuthorship,
    SubscriptionEmails,
  ],
  exports: [
    billingConfiguration,
    Polar,
    BillingCatalog,
    BillingAccounts,
    BillingEventService,
    BillingService,
  ],
})
export class BillingInfrastructureModule {
  static authPlugins() {
    const { polar } = billingConfig();
    if (!polar) {
      return [];
    }
    return [
      BillingBetterAuthPluginProvider,
      PolarBetterAuthPluginProvider,
      ...(polar.webhookSecret ? [PolarWebhooksBetterAuthPluginProvider] : []),
    ];
  }
}
