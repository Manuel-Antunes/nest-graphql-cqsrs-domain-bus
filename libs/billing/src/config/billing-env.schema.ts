import { z } from 'zod';

export const BillingEnvSchema = z.object({
  POLAR_ACCESS_TOKEN: z.string().optional(),
  POLAR_ENVIRONMENT: z.enum(['sandbox', 'production']).default('sandbox'),
  POLAR_WEBHOOK_SECRET: z.string().optional(),
  WEB_URL: z.url().default('http://localhost:4200'),
});
