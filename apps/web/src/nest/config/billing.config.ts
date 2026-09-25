import type { ConfigType } from '@nestjs/config';
import { registerAs } from '@nestjs/config';
import { BillingConfiguration } from '@nestposts/billing/infrastructure/billing.config';

import { env } from '@/env.mjs';

export const billingConfig = registerAs('billing', () => ({
  polar: BillingConfiguration.fromEnvironment({
    POLAR_ACCESS_TOKEN: env.POLAR_ACCESS_TOKEN,
    POLAR_ENVIRONMENT: env.POLAR_ENVIRONMENT,
    POLAR_WEBHOOK_SECRET: env.POLAR_WEBHOOK_SECRET,
  }),
}));

export type BillingSettings = ConfigType<typeof billingConfig>;
