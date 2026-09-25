import type { ConfigType } from '@nestjs/config';
import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const AppEnvSchema = z.object({
  POSTS_APPLICATION_NAME: z.string().min(1).default('posts-api'),
  OTEL_SERVICE_NAME: z.string().min(1).default('posts-api'),
  LOG_LEVEL: z.string().min(1).default('info'),
  PORT: z.coerce.number().int().positive().default(3000),
  POSTS_TRANSPORT: z
    .enum(['inngest', 'rabbitmq', 'memory', 'aws'])
    .default('inngest'),
  POSTS_PUBLISH_EVENTS: z.stringbool().default(true),
  POSTS_EXCHANGE: z.string().min(1).default('nestposts.events'),
  POSTS_COMPLETED_QUEUE: z
    .string()
    .min(1)
    .default('nestposts.posts-api.post-completed'),
  POSTS_SUBSCRIPTION_SOURCE: z.enum(['local', 'feed']).default('local'),
  SUBSCRIPTION_MAX_SECONDS: z.coerce.number().int().nonnegative().default(0),
  WEB_URL: z.url().default('http://localhost:4200'),
});

export const appConfig = registerAs('app', () => {
  const parsed = AppEnvSchema.parse(process.env);
  return {
    name: parsed.POSTS_APPLICATION_NAME,
    serviceName: parsed.OTEL_SERVICE_NAME,
    logLevel: parsed.LOG_LEVEL,
    port: parsed.PORT,
    transport: parsed.POSTS_TRANSPORT,
    publishes: parsed.POSTS_PUBLISH_EVENTS,
    exchange: parsed.POSTS_EXCHANGE,
    inboundQueue: parsed.POSTS_COMPLETED_QUEUE,
    subscriptionsFromFeed: parsed.POSTS_SUBSCRIPTION_SOURCE === 'feed',
    subscriptionMaxSeconds: parsed.SUBSCRIPTION_MAX_SECONDS,
    webUrl: parsed.WEB_URL,
  };
});

export type AppConfig = ConfigType<typeof appConfig>;
