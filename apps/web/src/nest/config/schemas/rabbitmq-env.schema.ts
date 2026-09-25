import { z } from 'zod';

export const RabbitmqEnvSchema = z.object({
  RABBITMQ_URL: z.string().min(1).default('amqp://localhost:5672'),
});
