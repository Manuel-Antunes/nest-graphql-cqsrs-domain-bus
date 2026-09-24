import type { Readable } from 'node:stream';
import type { S3Client } from '@aws-sdk/client-s3';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { OnModuleDestroy } from '@nestjs/common';
import { Disk } from 'flydrive';
import { S3Driver } from 'flydrive/drivers/s3';

import type { Disks } from '../../domain/schemas/disks.schema';
import { DiskService } from '../../domain/storage/disk.service';
import type { AssetStorageOptions } from './asset-storage.options';
import { s3ClientFor } from './asset-storage.options';

type S3UrlBuilder = NonNullable<
  ConstructorParameters<typeof S3Driver>[0]['urlBuilder']
>;

const DEFAULT_EXPIRY_SECONDS = 30 * 60;

const withTrailingSlash = (url: string): string =>
  url.endsWith('/') ? url : `${url}/`;

const expirySeconds = (expiresIn?: number | string): number =>
  typeof expiresIn === 'number'
    ? expiresIn
    : Number(expiresIn) || DEFAULT_EXPIRY_SECONDS;

const publicUrls = (
  signer: S3Client,
  options: AssetStorageOptions & { publicEndpoint: string },
): S3UrlBuilder => ({
  ...(options.cdnUrl
    ? {}
    : {
        generateURL: async (key, bucket) =>
          new URL(
            `${bucket}/${key}`,
            withTrailingSlash(options.publicEndpoint),
          ).toString(),
      }),
  generateSignedURL: (_key, input, _client, expiresIn) =>
    getSignedUrl(signer, new GetObjectCommand(input), {
      expiresIn: expirySeconds(expiresIn),
    }),
  generateSignedUploadURL: (_key, input, _client, expiresIn) =>
    getSignedUrl(signer, new PutObjectCommand(input), {
      expiresIn: expirySeconds(expiresIn),
    }),
});

export class FlydriveDiskService
  extends DiskService
  implements OnModuleDestroy
{
  constructor(
    private readonly drivers: Record<Disks, S3Driver>,
    private readonly defaultDisk: Disks,
    private readonly client: S3Client,
    private readonly bucket: string,
    private readonly signer?: S3Client,
  ) {
    super();
  }

  static from(
    options: AssetStorageOptions,
    client: S3Client,
  ): FlydriveDiskService {
    const signer = options.publicEndpoint
      ? s3ClientFor({ ...options, endpoint: options.publicEndpoint })
      : undefined;
    const urlBuilder =
      signer && options.publicEndpoint
        ? publicUrls(signer, {
            ...options,
            publicEndpoint: options.publicEndpoint,
          })
        : undefined;
    const driver = (visibility: Disks) =>
      new S3Driver({
        client,
        bucket: options.bucket,
        visibility,
        supportsACL: options.supportsACL ?? false,
        cdnUrl:
          visibility === 'public' && options.cdnUrl
            ? withTrailingSlash(options.cdnUrl)
            : undefined,
        urlBuilder,
      });
    return new FlydriveDiskService(
      { public: driver('public'), private: driver('private') },
      options.defaultDisk ?? 'public',
      client,
      options.bucket,
      signer,
    );
  }

  getDisk(disk: Disks = this.defaultDisk): Disk {
    const driver = this.drivers[disk];
    if (!driver) {
      throw new Error(`Disk ${disk} not found`);
    }
    return new Disk(driver);
  }

  async uploadStream(
    _disk: Disks,
    key: string,
    body: Readable,
    options?: { contentType?: string },
  ): Promise<void> {
    await new Upload({
      client: this.client,
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ...(options?.contentType ? { ContentType: options.contentType } : {}),
      },
    }).done();
  }

  onModuleDestroy(): void {
    this.client.destroy();
    this.signer?.destroy();
  }
}
