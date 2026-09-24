import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  NotFound,
  PutBucketPolicyCommand,
  S3Client,
} from '@aws-sdk/client-s3';

export const MINIO_IMAGE = 'minio/minio:latest';
export const MINIO_PORT = 9000;

export const STORAGE_BUCKET = 'nestposts';
export const STORAGE_REGION = 'us-east-1';
export const STORAGE_USER = 'nestposts';
export const STORAGE_PASSWORD = 'nestposts-secret';

export const ATTACHMENTS_PREFIX = 'assets/';

export const STAGING_PREFIX = 'tmp/';

export const storageUrl = (): string =>
  process.env.E2E_STORAGE_URL ?? `http://localhost:${MINIO_PORT}`;

export class Storage {
  private readonly client: S3Client;

  constructor(url: string = storageUrl()) {
    this.client = new S3Client({
      endpoint: url,
      region: STORAGE_REGION,
      forcePathStyle: true,
      credentials: {
        accessKeyId: STORAGE_USER,
        secretAccessKey: STORAGE_PASSWORD,
      },
    });
  }

  async prepare(): Promise<void> {
    await this.client.send(new CreateBucketCommand({ Bucket: STORAGE_BUCKET }));
    await this.client.send(
      new PutBucketPolicyCommand({
        Bucket: STORAGE_BUCKET,
        Policy: JSON.stringify({
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: { AWS: ['*'] },
              Action: ['s3:GetObject'],
              Resource: [
                `arn:aws:s3:::${STORAGE_BUCKET}/${ATTACHMENTS_PREFIX}*`,
              ],
            },
          ],
        }),
      }),
    );
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: STORAGE_BUCKET, Key: key }),
      );
      return true;
    } catch (failure) {
      if (failure instanceof NotFound) {
        return false;
      }
      throw failure;
    }
  }

  async read(key: string): Promise<Buffer> {
    const object = await this.client.send(
      new GetObjectCommand({ Bucket: STORAGE_BUCKET, Key: key }),
    );
    return Buffer.from(
      (await object.Body?.transformToByteArray()) ?? new Uint8Array(),
    );
  }

  async keys(prefix: string): Promise<string[]> {
    const page = await this.client.send(
      new ListObjectsV2Command({ Bucket: STORAGE_BUCKET, Prefix: prefix }),
    );
    return (page.Contents ?? []).flatMap((object) =>
      object.Key ? [object.Key] : [],
    );
  }

  close(): void {
    this.client.destroy();
  }
}
