import { Inject, Injectable } from '@nestjs/common';
import type {
  S3DiskOptions,
  StorageModuleOptions,
  StorageOptionsFactory,
} from '@nestjs/storage';

import type { StorageConfig } from '../../config/storage.config';
import { storageConfig } from '../../config/storage.config';
import { PublicEndpointS3Disk } from './public-endpoint-s3.disk';

export type BucketStorage = Pick<StorageConfig, 'bucket'> &
  Partial<Omit<StorageConfig, 'bucket'>>;

const DEFAULT_REGION = 'us-east-1';

export class MissingStorageCredentialsException extends Error {
  constructor() {
    super(
      'the bucket has no credentials: set DRIVE_AWS_ACCESS_KEY_ID and DRIVE_AWS_SECRET_ACCESS_KEY, or AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY',
    );
    this.name = 'MissingStorageCredentialsException';
  }
}

@Injectable()
export class BucketDisks implements StorageOptionsFactory {
  constructor(
    @Inject(storageConfig.KEY) private readonly storage: BucketStorage,
  ) {}

  createStorageOptions(): StorageModuleOptions {
    const options: S3DiskOptions = {
      bucket: this.storage.bucket,
      region: this.storage.region,
      endpoint: this.storage.endpoint,
      forcePathStyle: this.storage.forcePathStyle,
      credentials: this.storage.credentials ?? BucketDisks.missingCredentials,
    };
    return {
      default: this.storage.defaultDisk ?? 'public',
      disks: {
        public: PublicEndpointS3Disk.signingAt(
          { ...options, publicUrl: this.publicUrl() },
          this.storage.publicEndpoint,
        ),
        private: PublicEndpointS3Disk.signingAt(
          options,
          this.storage.publicEndpoint,
        ),
      },
    };
  }

  private static missingCredentials(): never {
    throw new MissingStorageCredentialsException();
  }

  private publicUrl(): string {
    const { bucket, cdnUrl, publicEndpoint, endpoint, forcePathStyle } =
      this.storage;
    if (cdnUrl) {
      return cdnUrl;
    }
    const base = publicEndpoint ?? endpoint;
    if (!base) {
      return `https://${bucket}.s3.${this.storage.region ?? DEFAULT_REGION}.amazonaws.com`;
    }
    if (publicEndpoint || forcePathStyle) {
      return `${base.replace(/\/+$/, '')}/${bucket}`;
    }
    const url = new URL(base);
    return `${url.protocol}//${bucket}.${url.host}`;
  }
}
