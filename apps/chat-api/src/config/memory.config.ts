import type { ConfigType } from '@nestjs/config';
import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const MemoryEnvSchema = z.object({
  AWS_REGION: z.string().min(1).default('us-east-1'),
  CHAT_AGENT_MEMORIES: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
        .map((entry) => {
          const [agentId, memoryId] = entry
            .split('=')
            .map((part) => part.trim());
          return { agentId, memoryId };
        }),
    )
    .pipe(
      z.array(
        z.object({ agentId: z.string().min(1), memoryId: z.string().min(1) }),
      ),
    ),
});

export const memoryConfig = registerAs('memory', () => {
  const parsed = MemoryEnvSchema.parse(process.env);
  return {
    region: parsed.AWS_REGION,
    memories: parsed.CHAT_AGENT_MEMORIES,
  };
});

export type MemoryConfig = ConfigType<typeof memoryConfig>;
