import {
  CreateBucketCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  NotFound,
  PutBucketPolicyCommand,
  S3Client,
} from '@aws-sdk/client-s3';

export class Storage {
  static readonly BUCKET = 'nestposts';
  static readonly REGION = 'us-east-1';
  static readonly USER = 'nestposts';
  static readonly PASSWORD = 'nestposts-secret';
  static readonly ATTACHMENTS_PREFIX = 'assets/';
  static readonly AVATARS_PREFIX = 'avatars/';
  static readonly STAGING_PREFIX = 'tmp/';

  private readonly client: S3Client;

  constructor(url: string) {
    this.client = new S3Client({
      endpoint: url,
      region: Storage.REGION,
      forcePathStyle: true,
      credentials: {
        accessKeyId: Storage.USER,
        secretAccessKey: Storage.PASSWORD,
      },
    });
  }

  async prepare(): Promise<void> {
    await this.client.send(new CreateBucketCommand({ Bucket: Storage.BUCKET }));
    await this.client.send(
      new PutBucketPolicyCommand({
        Bucket: Storage.BUCKET,
        Policy: JSON.stringify({
          Version: '2012-10-17',
          Statement: [
            {
              Effect: 'Allow',
              Principal: { AWS: ['*'] },
              Action: ['s3:GetObject'],
              Resource: [
                `arn:aws:s3:::${Storage.BUCKET}/${Storage.ATTACHMENTS_PREFIX}*`,
                `arn:aws:s3:::${Storage.BUCKET}/${Storage.AVATARS_PREFIX}*`,
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
        new HeadObjectCommand({ Bucket: Storage.BUCKET, Key: key }),
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
      new GetObjectCommand({ Bucket: Storage.BUCKET, Key: key }),
    );
    return Buffer.from(
      (await object.Body?.transformToByteArray()) ?? new Uint8Array(),
    );
  }

  async keys(prefix: string): Promise<string[]> {
    const page = await this.client.send(
      new ListObjectsV2Command({ Bucket: Storage.BUCKET, Prefix: prefix }),
    );
    return (page.Contents ?? []).flatMap((object) =>
      object.Key ? [object.Key] : [],
    );
  }

  close(): void {
    this.client.destroy();
  }
}
