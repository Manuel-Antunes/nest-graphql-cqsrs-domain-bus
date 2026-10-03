import type { ConfigType } from '@nestjs/config';
import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const BedrockEnvSchema = z.object({
  AWS_REGION: z.string().min(1).default('us-east-1'),
  POSTS_AGENT_MODEL_ID: z
    .string()
    .min(1)
    .default('global.anthropic.claude-sonnet-5-5'),
  POSTS_AGENT_TEMPERATURE: z.coerce.number().min(0).max(1).optional(),
});

export const bedrockConfig = registerAs('bedrock', () => {
  const parsed = BedrockEnvSchema.parse(process.env);
  return {
    region: parsed.AWS_REGION,
    model: parsed.POSTS_AGENT_MODEL_ID,
    temperature: parsed.POSTS_AGENT_TEMPERATURE,
  };
});

export type BedrockConfig = ConfigType<typeof bedrockConfig>;
