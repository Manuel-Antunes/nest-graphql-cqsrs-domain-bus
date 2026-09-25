import { z } from 'zod';

export const BillingConfigSchema = z.object({
  accessToken: z.string().min(1),
  server: z.enum(['sandbox', 'production']),
  webhookSecret: z.string().min(1).optional(),
});

export type BillingConfig = z.infer<typeof BillingConfigSchema>;

export class BillingConfiguration {
  static fromEnvironment(
    env: Readonly<Record<string, string | undefined>> = process.env,
  ): BillingConfig | null {
    if (!env.POLAR_ACCESS_TOKEN) {
      return null;
    }
    return BillingConfigSchema.parse({
      accessToken: env.POLAR_ACCESS_TOKEN,
      server: env.POLAR_ENVIRONMENT || 'sandbox',
      webhookSecret: env.POLAR_WEBHOOK_SECRET || undefined,
    });
  }
}
