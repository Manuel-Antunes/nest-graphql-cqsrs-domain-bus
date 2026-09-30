import { registerAs } from '@nestjs/config';
import { z } from 'zod';

import { AiToolsConfigEnvSchema } from './schema';

export type AiToolsConfig = z.infer<typeof AiToolsConfigEnvSchema>;

export default registerAs('aiTools', () => {
  const env = AiToolsConfigEnvSchema.parse(process.env);
  return env;
});
