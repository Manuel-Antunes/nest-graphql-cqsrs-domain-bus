import type { ConfigType } from '@nestjs/config';
import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const AgentsEnvSchema = z.object({
  THEO_A2A_AGENTS: z
    .string()
    .default('http://localhost:9000/')
    .transform((value) =>
      value
        .split(',')
        .map((url) => url.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.url()).min(1)),
});

export const agentsConfig = registerAs('agents', () => {
  const parsed = AgentsEnvSchema.parse(process.env);
  return { urls: parsed.THEO_A2A_AGENTS };
});

export type AgentsConfig = ConfigType<typeof agentsConfig>;
