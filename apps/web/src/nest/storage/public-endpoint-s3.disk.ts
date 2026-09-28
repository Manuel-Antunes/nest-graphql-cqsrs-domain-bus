import type {
  S3DiskOptions,
  StorageSignedUpload,
  StorageSignedUploadRequest,
} from '@nestjs/storage';
import { S3Disk } from '@nestjs/storage';

export class PublicEndpointS3Disk extends S3Disk {
  constructor(
    options: S3DiskOptions,
    private readonly publicSigner?: PublicEndpointS3Disk,
  ) {
    super(options);
  }

  static signingAt(
    options: S3DiskOptions,
    publicEndpoint: string | undefined,
  ): S3Disk {
    return publicEndpoint
      ? new PublicEndpointS3Disk(
          options,
          new PublicEndpointS3Disk({ ...options, endpoint: publicEndpoint }),
        )
      : new S3Disk(options);
  }

  protected override presignGet(
    key: string,
    expiresAt: Date,
    contentDisposition: string | undefined,
  ): Promise<string> {
    return this.publicSigner
      ? this.publicSigner.presignGet(key, expiresAt, contentDisposition)
      : super.presignGet(key, expiresAt, contentDisposition);
  }

  protected override presignPut(
    key: string,
    expiresAt: Date,
    request: StorageSignedUploadRequest,
  ): Promise<StorageSignedUpload> {
    return this.publicSigner
      ? this.publicSigner.presignPut(key, expiresAt, request)
      : super.presignPut(key, expiresAt, request);
  }
}
