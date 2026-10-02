import type { ConfigType } from '@nestjs/config';
import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const WebSearchEnvSchema = z.object({
  THEO_WEB_SEARCH_URL: z.url().or(z.literal('')).optional(),
});

export const webSearchConfig = registerAs('webSearch', () => {
  const parsed = WebSearchEnvSchema.parse(process.env);
  return { url: parsed.THEO_WEB_SEARCH_URL || undefined };
});

export type WebSearchConfig = ConfigType<typeof webSearchConfig>;
