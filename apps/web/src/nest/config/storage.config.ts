import type { ConfigType } from '@nestjs/config';
import { registerAs } from '@nestjs/config';

import { env } from '@/env.mjs';

export const storageConfig = registerAs('storage', () => ({
  defaultDisk: env.DRIVE_DISK,
  bucket: env.DRIVE_BUCKET,
  region: env.DRIVE_AWS_REGION ?? env.AWS_REGION ?? env.AWS_DEFAULT_REGION,
  endpoint: env.DRIVE_S3_ENDPOINT,
  publicEndpoint: env.DRIVE_S3_PUBLIC_ENDPOINT,
  forcePathStyle:
    env.DRIVE_S3_FORCE_PATH_STYLE ?? env.NODE_ENV !== 'production',
  cdnUrl: env.DRIVE_CDN_URL,
  credentials:
    env.DRIVE_AWS_ACCESS_KEY_ID && env.DRIVE_AWS_SECRET_ACCESS_KEY
      ? {
          accessKeyId: env.DRIVE_AWS_ACCESS_KEY_ID,
          secretAccessKey: env.DRIVE_AWS_SECRET_ACCESS_KEY,
        }
      : env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY
        ? {
            accessKeyId: env.AWS_ACCESS_KEY_ID,
            secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
            sessionToken: env.AWS_SESSION_TOKEN,
          }
        : undefined,
}));

export type StorageConfig = ConfigType<typeof storageConfig>;
