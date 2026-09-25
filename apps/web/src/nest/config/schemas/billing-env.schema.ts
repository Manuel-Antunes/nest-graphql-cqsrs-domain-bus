import { z } from 'zod';

export const BillingEnvSchema = z.object({
  POLAR_ACCESS_TOKEN: z.string().optional(),
  POLAR_ENVIRONMENT: z.string().optional(),
  POLAR_WEBHOOK_SECRET: z.string().optional(),
});
