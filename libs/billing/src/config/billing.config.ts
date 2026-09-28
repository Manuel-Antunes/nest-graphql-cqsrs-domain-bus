import type { ConfigType } from '@nestjs/config';
import { registerAs } from '@nestjs/config';

import { BillingEnvSchema } from './billing-env.schema';

export const billingConfig = registerAs('billing', () => {
  const env = BillingEnvSchema.parse({
    POLAR_ACCESS_TOKEN: process.env.POLAR_ACCESS_TOKEN || undefined,
    POLAR_ENVIRONMENT: process.env.POLAR_ENVIRONMENT || undefined,
    POLAR_WEBHOOK_SECRET: process.env.POLAR_WEBHOOK_SECRET || undefined,
    WEB_URL: process.env.WEB_URL || undefined,
  });
  return {
    polar: env.POLAR_ACCESS_TOKEN
      ? {
          accessToken: env.POLAR_ACCESS_TOKEN,
          server: env.POLAR_ENVIRONMENT,
          webhookSecret: env.POLAR_WEBHOOK_SECRET,
        }
      : null,
    settingsUrl: new URL('/settings/billing', env.WEB_URL).toString(),
  };
});

export type BillingConfig = ConfigType<typeof billingConfig>;
