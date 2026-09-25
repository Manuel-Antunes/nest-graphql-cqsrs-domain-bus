import type { ConfigType } from '@nestjs/config';
import { registerAs } from '@nestjs/config';
import type { AwsClientConfig } from '@nestposts/microservices-aws';
import {
  LOCALSTACK_CREDENTIALS,
  LOCALSTACK_REGION,
  localQueueUrl,
  localTopicArn,
} from '@nestposts/microservices-aws';
import { z } from 'zod';

const AwsEnvSchema = z.object({
  AWS_ENDPOINT_URL: z.string().optional(),
  AWS_REGION: z.string().optional(),
  AWS_DEFAULT_REGION: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  POSTS_TOPIC_ARN: z.string().optional(),
  POSTS_COMPLETED_QUEUE_URL: z.string().optional(),
});

export const awsConfig = registerAs('aws', () => {
  const parsed = AwsEnvSchema.parse(process.env);
  const endpoint = parsed.AWS_ENDPOINT_URL || undefined;
  const region = parsed.AWS_REGION || parsed.AWS_DEFAULT_REGION || undefined;
  const client: AwsClientConfig = endpoint
    ? {
        endpoint,
        region: region ?? LOCALSTACK_REGION,
        ...(parsed.AWS_ACCESS_KEY_ID
          ? {}
          : { credentials: LOCALSTACK_CREDENTIALS }),
      }
    : region
      ? { region }
      : {};
  return {
    client,
    topicArn:
      parsed.POSTS_TOPIC_ARN || localTopicArn('nestposts-events.fifo', region),
    inboundQueueUrl:
      parsed.POSTS_COMPLETED_QUEUE_URL ||
      localQueueUrl('nestposts-posts-api-completed.fifo', endpoint),
  };
});

export type AwsConfig = ConfigType<typeof awsConfig>;
