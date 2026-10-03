import type { ConfigType } from '@nestjs/config';
import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const MemoryEnvSchema = z.object({
  AWS_REGION: z.string().min(1).default('us-east-1'),
  BEDROCK_AGENTCORE_MEMORY_ID: z.string().min(1).optional(),
});

export const memoryConfig = registerAs('memory', () => {
  const parsed = MemoryEnvSchema.parse(process.env);
  return {
    region: parsed.AWS_REGION,
    memoryId: parsed.BEDROCK_AGENTCORE_MEMORY_ID ?? null,
  };
});

export type MemoryConfig = ConfigType<typeof memoryConfig>;
