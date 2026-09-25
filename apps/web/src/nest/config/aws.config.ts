import type { ConfigType } from '@nestjs/config';
import { registerAs } from '@nestjs/config';
import type { AwsClientConfig } from '@nestposts/microservices-aws';
import {
  LOCALSTACK_CREDENTIALS,
  LOCALSTACK_REGION,
  localTopicArn,
} from '@nestposts/microservices-aws';

import { env } from '@/env.mjs';

export const awsConfig = registerAs('aws', () => {
  const endpoint = env.AWS_ENDPOINT_URL;
  const region = env.AWS_REGION ?? env.AWS_DEFAULT_REGION;
  const client: AwsClientConfig = endpoint
    ? {
        endpoint,
        region: region ?? LOCALSTACK_REGION,
        ...(env.AWS_ACCESS_KEY_ID
          ? {}
          : { credentials: LOCALSTACK_CREDENTIALS }),
      }
    : region
      ? { region }
      : {};
  return {
    client,
    topicArn:
      env.WEB_TOPIC_ARN ?? localTopicArn('nestposts-events.fifo', region),
  };
});

export type AwsConfig = ConfigType<typeof awsConfig>;
