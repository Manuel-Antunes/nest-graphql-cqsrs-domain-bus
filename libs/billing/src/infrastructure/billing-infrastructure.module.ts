import type { DynamicModule, Type } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { Polar } from '@polar-sh/sdk';

import { BillingAccounts } from '../domain/billing/billing-accounts';
import { BillingCatalog } from '../domain/billing/billing-catalog';
import type { SubscriptionListener } from '../domain/billing/subscription-listener';
import { BillingBetterAuthPluginProvider } from './better-auth/billing-better-auth.plugin';
import { PolarBetterAuthPluginProvider } from './better-auth/polar-better-auth.plugin';
import { PolarWebhooksBetterAuthPluginProvider } from './better-auth/polar-webhooks-better-auth.plugin';
import type { BillingConfig } from './billing.config';
import { PolarBillingAccounts } from './polar/polar-billing-accounts';
import { PolarBillingCatalog } from './polar/polar-billing-catalog';
import { BILLING_CONFIG, SUBSCRIPTION_LISTENERS } from './tokens';

export interface BillingModuleOptions {
  listeners?: readonly Type<SubscriptionListener>[];
}

@Module({})
export class BillingInfrastructureModule {
  static forRoot(
    config: BillingConfig | null,
    { listeners = [] }: BillingModuleOptions = {},
  ): DynamicModule {
    if (!config) {
      return { module: BillingInfrastructureModule };
    }

    return {
      module: BillingInfrastructureModule,
      providers: [
        { provide: BILLING_CONFIG, useValue: config },
        {
          provide: Polar,
          useFactory: ({ accessToken, server }: BillingConfig) =>
            new Polar({ accessToken, server }),
          inject: [BILLING_CONFIG],
        },
        { provide: BillingCatalog, useClass: PolarBillingCatalog },
        { provide: BillingAccounts, useClass: PolarBillingAccounts },
        ...listeners,
        {
          provide: SUBSCRIPTION_LISTENERS,
          useFactory: (...registered: SubscriptionListener[]) => registered,
          inject: [...listeners],
        },
      ],
      exports: [
        BILLING_CONFIG,
        Polar,
        BillingCatalog,
        BillingAccounts,
        SUBSCRIPTION_LISTENERS,
      ],
    };
  }

  static authPlugins(config: BillingConfig | null) {
    if (!config) {
      return [];
    }
    return [
      BillingBetterAuthPluginProvider,
      PolarBetterAuthPluginProvider,
      ...(config.webhookSecret ? [PolarWebhooksBetterAuthPluginProvider] : []),
    ];
  }
}
