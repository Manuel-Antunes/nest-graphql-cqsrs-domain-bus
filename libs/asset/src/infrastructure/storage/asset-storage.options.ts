import { S3Client } from '@aws-sdk/client-s3';

import type { Disks } from '../../domain/schemas/disks.schema';
import { AssetStorageEnvSchema } from './schemas/asset-storage-env.schema';

/** Where assets are stored: one S3-compatible bucket, served as a public and a private disk. */
export interface AssetStorageOptions {
  bucket: string;
  /** The disk `DiskService.getDisk()` answers with when none is named. Defaults to `public`. */
  defaultDisk?: Disks;
  region?: string;
  /** An S3-compatible endpoint (MinIO, LocalStack). Leave it unset for AWS itself. */
  endpoint?: string;
  /**
   * Where a client outside this service's network reaches the same storage, when that is not
   * `endpoint`: MinIO addressed as `minio:9000` inside a Docker network and as `localhost:9000` by
   * the browser. A signed URL is bound to the host it was signed for, so signed URLs (uploads
   * included), and unsigned ones when there is no CDN, are built against this one.
   */
  publicEndpoint?: string;
  forcePathStyle?: boolean;
  /** Serves the public disk's URLs from a CDN instead of the bucket. */
  cdnUrl?: string;
  /** Explicit keys. Leave them unset to use the AWS SDK's own credential chain. */
  credentials?: { accessKeyId: string; secretAccessKey: string };
  /**
   * Whether writes carry an object ACL. Off by default: a bucket with `BucketOwnerEnforced`
   * ownership rejects every `PutObject` that sends one, and visibility is then the bucket's
   * business.
   */
  supportsACL?: boolean;
}

/**
 * The options read from `DRIVE_*`: `DRIVE_DISK`, `DRIVE_BUCKET`, `DRIVE_CDN_URL`,
 * `DRIVE_S3_ENDPOINT`, `DRIVE_S3_PUBLIC_ENDPOINT`, `DRIVE_AWS_REGION`, `DRIVE_AWS_ACCESS_KEY_ID` and
 * `DRIVE_AWS_SECRET_ACCESS_KEY`. Path-style addressing is used outside production, unless
 * `DRIVE_S3_FORCE_PATH_STYLE` says otherwise — which a production build talking to MinIO needs.
 */
export const assetStorageOptionsFromEnv = (
  env: NodeJS.ProcessEnv = process.env,
): AssetStorageOptions => {
  const parsed = AssetStorageEnvSchema.parse(env);
  return {
    bucket: parsed.DRIVE_BUCKET,
    defaultDisk: parsed.DRIVE_DISK,
    region: parsed.DRIVE_AWS_REGION,
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
        : undefined,
  };
};

export const s3ClientFor = (options: AssetStorageOptions): S3Client =>
  new S3Client({
    region: options.region,
    endpoint: options.endpoint,
    forcePathStyle: options.forcePathStyle,
    credentials: options.credentials,
  });
