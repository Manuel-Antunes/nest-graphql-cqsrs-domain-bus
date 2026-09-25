import { z } from 'zod';

export const InngestEnvSchema = z.object({
  INNGEST_DEV: z.stringbool().default(true),
  INNGEST_BASE_URL: z.string().min(1).default('http://localhost:8288'),
  INNGEST_EVENT_KEY: z.string().optional(),
  INNGEST_SIGNING_KEY: z.string().optional(),
});
