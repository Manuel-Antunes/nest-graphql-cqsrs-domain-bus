import type { ConfigType } from '@nestjs/config';
import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const RabbitmqEnvSchema = z.object({
  RABBITMQ_URL: z.string().min(1).default('amqp://localhost:5672'),
});

export const rabbitmqConfig = registerAs('rabbitmq', () => {
  const parsed = RabbitmqEnvSchema.parse(process.env);
  return { urls: [parsed.RABBITMQ_URL] };
});

export type RabbitmqConfig = ConfigType<typeof rabbitmqConfig>;
