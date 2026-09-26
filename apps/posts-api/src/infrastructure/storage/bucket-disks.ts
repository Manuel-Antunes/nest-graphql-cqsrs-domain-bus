import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { OnModuleDestroy } from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';
import type { DriveOptions } from '@nestposts/asset/infrastructure/drive/drive';
import type { DriveOptionsFactory } from '@nestposts/asset/infrastructure/drive/drive.module-definition';
import { S3Driver } from 'flydrive/drivers/s3';

import type { StorageConfig } from '../../config/storage.config';
import { storageConfig } from '../../config/storage.config';

export type BucketStorage = Pick<StorageConfig, 'bucket'> &
  Partial<Omit<StorageConfig, 'bucket'>>;

type S3UrlBuilder = NonNullable<
  ConstructorParameters<typeof S3Driver>[0]['urlBuilder']
>;

const DEFAULT_EXPIRY_SECONDS = 30 * 60;

@Injectable()
export class BucketDisks implements DriveOptionsFactory, OnModuleDestroy {
  private readonly clients: S3Client[] = [];

  constructor(
    @Inject(storageConfig.KEY) private readonly storage: BucketStorage,
  ) {}

  createDriveOptions(): DriveOptions {
    const client = this.client(this.storage.endpoint);
    const urlBuilder = this.storage.publicEndpoint
      ? BucketDisks.publicUrls(
          this.client(this.storage.publicEndpoint),
          this.storage.publicEndpoint,
          this.storage.cdnUrl,
        )
      : undefined;
    const disk = (visibility: 'public' | 'private') => () =>
      new S3Driver({
        client,
        bucket: this.storage.bucket,
        visibility,
        supportsACL: this.storage.supportsACL ?? false,
        cdnUrl:
          visibility === 'public' && this.storage.cdnUrl
            ? BucketDisks.withTrailingSlash(this.storage.cdnUrl)
            : undefined,
        urlBuilder,
      });
    return {
      default: this.storage.defaultDisk ?? 'public',
      services: { public: disk('public'), private: disk('private') },
    };
  }

  onModuleDestroy(): void {
    for (const client of this.clients.splice(0)) {
      client.destroy();
    }
  }

  private client(endpoint?: string): S3Client {
    const client = new S3Client({
      region: this.storage.region,
      endpoint,
      forcePathStyle: this.storage.forcePathStyle,
      credentials: this.storage.credentials,
    });
    this.clients.push(client);
    return client;
  }

  private static publicUrls(
    signer: S3Client,
    publicEndpoint: string,
    cdnUrl: string | undefined,
  ): S3UrlBuilder {
    return {
      ...(cdnUrl
        ? {}
        : {
            generateURL: async (key, bucket) =>
              new URL(
                `${bucket}/${key}`,
                BucketDisks.withTrailingSlash(publicEndpoint),
              ).toString(),
          }),
      generateSignedURL: (_key, input, _client, expiresIn) =>
        getSignedUrl(signer, new GetObjectCommand(input), {
          expiresIn: BucketDisks.expirySeconds(expiresIn),
        }),
      generateSignedUploadURL: (_key, input, _client, expiresIn) =>
        getSignedUrl(signer, new PutObjectCommand(input), {
          expiresIn: BucketDisks.expirySeconds(expiresIn),
        }),
    };
  }

  private static withTrailingSlash(url: string): string {
    return url.endsWith('/') ? url : `${url}/`;
  }

  private static expirySeconds(expiresIn?: number | string): number {
    return typeof expiresIn === 'number'
      ? expiresIn
      : Number(expiresIn) || DEFAULT_EXPIRY_SECONDS;
  }
}
