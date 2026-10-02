import type { ConfigType } from '@nestjs/config';
import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const MemoryEnvSchema = z.object({
  AWS_REGION: z.string().min(1).default('us-east-1'),
  BEDROCK_AGENTCORE_MEMORY_ID: z.string().min(1).optional(),
  POSTS_AGENT_RECALL_LIMIT: z.coerce.number().int().positive().default(20),
});

export const memoryConfig = registerAs('memory', () => {
  const parsed = MemoryEnvSchema.parse(process.env);
  return {
    region: parsed.AWS_REGION,
    memoryId: parsed.BEDROCK_AGENTCORE_MEMORY_ID ?? null,
    recallLimit: parsed.POSTS_AGENT_RECALL_LIMIT,
  };
});

export type MemoryConfig = ConfigType<typeof memoryConfig>;
