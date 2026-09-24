import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutBucketPolicyCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { StartedTestContainer } from 'testcontainers';
import { GenericContainer, Wait } from 'testcontainers';

import type { AssetStorageOptions } from '../storage/asset-storage.options';

const MINIO_PORT = 9000;

const PUBLIC_PREFIX = 'tmp';

export interface TestStorage {
  /** Options pointing at the container, for `AssetInfrastructureModule.forRoot`. */
  options: AssetStorageOptions;
  /** Empties the bucket. */
  drop(): Promise<void>;
  stop(): Promise<void>;
}

/**
 * A throwaway MinIO with an empty bucket, for a suite that stores real objects.
 *
 * The bucket answers anonymous reads under `tmp/` only, like a deployed bucket whose download prefix
 * is public. MinIO has no object ACLs, so everything else is read through a signed URL.
 */
export async function setupTestStorage(): Promise<TestStorage> {
  const credentials = {
    accessKeyId: 'nestposts',
    secretAccessKey: 'nestposts',
  };
  const bucket = 'assets';

  const container: StartedTestContainer = await new GenericContainer(
    'minio/minio:latest',
  )
    .withCommand(['server', '/data'])
    .withEnvironment({
      MINIO_ROOT_USER: credentials.accessKeyId,
      MINIO_ROOT_PASSWORD: credentials.secretAccessKey,
    })
    .withExposedPorts(MINIO_PORT)
    .withWaitStrategy(Wait.forHttp('/minio/health/live', MINIO_PORT))
    .start();

  const options: AssetStorageOptions = {
    bucket,
    region: 'us-east-1',
    endpoint: `http://${container.getHost()}:${container.getMappedPort(MINIO_PORT)}`,
    forcePathStyle: true,
    credentials,
    supportsACL: true,
  };

  const client = new S3Client({
    region: options.region,
    endpoint: options.endpoint,
    forcePathStyle: true,
    credentials,
  });
  await client.send(new CreateBucketCommand({ Bucket: bucket }));
  await client.send(
    new PutBucketPolicyCommand({
      Bucket: bucket,
      Policy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: { AWS: ['*'] },
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${bucket}/${PUBLIC_PREFIX}/*`],
          },
        ],
      }),
    }),
  );

  return {
    options,
    async drop() {
      let token: string | undefined;
      do {
        const page = await client.send(
          new ListObjectsV2Command({
            Bucket: bucket,
            ContinuationToken: token,
          }),
        );
        const keys = (page.Contents ?? []).flatMap((object) =>
          object.Key ? [{ Key: object.Key }] : [],
        );
        if (keys.length > 0) {
          await client.send(
            new DeleteObjectsCommand({
              Bucket: bucket,
              Delete: { Objects: keys },
            }),
          );
        }
        token = page.NextContinuationToken;
      } while (token);
    },
    async stop() {
      client.destroy();
      await container.stop();
    },
  };
}
