import { z } from 'zod';

export const AwsEnvSchema = z.object({
  AWS_ENDPOINT_URL: z.string().optional(),
  AWS_REGION: z.string().optional(),
  AWS_DEFAULT_REGION: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  WEB_TOPIC_ARN: z.string().optional(),
});
