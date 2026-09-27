import type { ConfigType } from '@nestjs/config';
import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const InngestEnvSchema = z.object({
  INNGEST_DEV: z.stringbool().default(true),
  INNGEST_BASE_URL: z.string().min(1).default('http://localhost:8288'),
  INNGEST_EVENT_KEY: z.string().optional(),
  INNGEST_SIGNING_KEY: z.string().optional(),
  INNGEST_SERVE_ORIGIN: z.string().optional(),
});

export const inngestConfig = registerAs('inngest', () => {
  const parsed = InngestEnvSchema.parse(process.env);
  return {
    client: {
      isDev: parsed.INNGEST_DEV,
      baseUrl: parsed.INNGEST_BASE_URL,
      eventKey: parsed.INNGEST_EVENT_KEY || undefined,
      signingKey: parsed.INNGEST_SIGNING_KEY || undefined,
    },
    serveOrigin: parsed.INNGEST_SERVE_ORIGIN || undefined,
  };
});

export type InngestConfig = ConfigType<typeof inngestConfig>;
