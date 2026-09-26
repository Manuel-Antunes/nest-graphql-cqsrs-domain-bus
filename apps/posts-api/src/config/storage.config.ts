import type { ConfigType } from '@nestjs/config';
import { registerAs } from '@nestjs/config';
import { z } from 'zod';

const StorageEnvSchema = z.object({
  DRIVE_DISK: z.enum(['public', 'private']).default('public'),
  DRIVE_BUCKET: z.string().default('local'),
  DRIVE_CDN_URL: z.url().optional(),
  DRIVE_S3_ENDPOINT: z.string().optional(),
  DRIVE_S3_PUBLIC_ENDPOINT: z.url().optional(),
  DRIVE_S3_FORCE_PATH_STYLE: z.stringbool().optional(),
  DRIVE_AWS_ACCESS_KEY_ID: z.string().optional(),
  DRIVE_AWS_SECRET_ACCESS_KEY: z.string().optional(),
  DRIVE_AWS_REGION: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_SESSION_TOKEN: z.string().optional(),
  AWS_REGION: z.string().optional(),
  AWS_DEFAULT_REGION: z.string().optional(),
  NODE_ENV: z.string().optional(),
});

export const storageConfig = registerAs('storage', () => {
  const parsed = StorageEnvSchema.parse(process.env);
  return {
    defaultDisk: parsed.DRIVE_DISK,
    bucket: parsed.DRIVE_BUCKET,
    region:
      parsed.DRIVE_AWS_REGION ?? parsed.AWS_REGION ?? parsed.AWS_DEFAULT_REGION,
    endpoint: parsed.DRIVE_S3_ENDPOINT,
    publicEndpoint: parsed.DRIVE_S3_PUBLIC_ENDPOINT,
    forcePathStyle:
      parsed.DRIVE_S3_FORCE_PATH_STYLE ?? parsed.NODE_ENV !== 'production',
    cdnUrl: parsed.DRIVE_CDN_URL,
    credentials:
      parsed.DRIVE_AWS_ACCESS_KEY_ID && parsed.DRIVE_AWS_SECRET_ACCESS_KEY
        ? {
            accessKeyId: parsed.DRIVE_AWS_ACCESS_KEY_ID,
            secretAccessKey: parsed.DRIVE_AWS_SECRET_ACCESS_KEY,
          }
        : parsed.AWS_ACCESS_KEY_ID && parsed.AWS_SECRET_ACCESS_KEY
          ? {
              accessKeyId: parsed.AWS_ACCESS_KEY_ID,
              secretAccessKey: parsed.AWS_SECRET_ACCESS_KEY,
              sessionToken: parsed.AWS_SESSION_TOKEN,
            }
          : undefined,
  };
});

export type StorageConfig = ConfigType<typeof storageConfig>;
