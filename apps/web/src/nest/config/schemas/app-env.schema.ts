import { z } from 'zod';

export const AppEnvSchema = z.object({
  WEB_APPLICATION_NAME: z.string().min(1).default('web'),
  WEB_URL: z.url().default('http://localhost:4200'),
  WEB_TRANSPORT: z
    .enum(['inngest', 'rabbitmq', 'memory', 'aws'])
    .default('inngest'),
  WEB_PUBLISH_EVENTS: z.stringbool().default(true),
  WEB_EXCHANGE: z.string().min(1).default('nestposts.events'),
});
