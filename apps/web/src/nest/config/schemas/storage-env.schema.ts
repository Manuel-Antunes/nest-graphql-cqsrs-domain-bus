import { z } from 'zod';

export const StorageEnvSchema = z.object({
  DRIVE_DISK: z.enum(['public', 'private']).default('public'),
  DRIVE_BUCKET: z.string().default('local'),
  DRIVE_CDN_URL: z.url().optional(),
  DRIVE_S3_ENDPOINT: z.string().optional(),
  DRIVE_S3_PUBLIC_ENDPOINT: z.url().optional(),
  DRIVE_S3_FORCE_PATH_STYLE: z.stringbool().optional(),
  DRIVE_AWS_ACCESS_KEY_ID: z.string().optional(),
  DRIVE_AWS_SECRET_ACCESS_KEY: z.string().optional(),
  DRIVE_AWS_REGION: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_SESSION_TOKEN: z.string().optional(),
});
