import { ConfigType, registerAs } from '@nestjs/config';
import { z } from 'zod';

import { AiConfigEnvSchema } from './schema';

export type AiEnvConfig = z.infer<typeof AiConfigEnvSchema>;

const aiConfig = registerAs('ai', () => {
  const env = AiConfigEnvSchema.parse(process.env);
  return env;
});

export default aiConfig;

export type AiConfig = ConfigType<typeof aiConfig>;
