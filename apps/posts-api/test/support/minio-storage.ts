import {
  CreateBucketCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutBucketPolicyCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { DynamicModule } from '@nestjs/common';
import type { StartedTestContainer } from 'testcontainers';
import { GenericContainer, Wait } from 'testcontainers';

import { storageConfig } from '../../src/config/storage.config';
import type { BucketStorage } from '../../src/infrastructure/storage/bucket-disks';

const MINIO_PORT = 9000;

const PUBLIC_PREFIX = 'tmp';

export interface MinioStorage {
  storage: BucketStorage;
  configModule(): DynamicModule;
  drop(): Promise<void>;
  stop(): Promise<void>;
}

export async function startMinioStorage(): Promise<MinioStorage> {
  const credentials = {
    accessKeyId: 'nestposts',
    secretAccessKey: 'nestposts',
  };
  const bucket = 'assets';

  const container: StartedTestContainer = await new GenericContainer(
    'pgsty/minio:latest',
  )
    .withCommand(['server', '/data'])
    .withEnvironment({
      MINIO_ROOT_USER: credentials.accessKeyId,
      MINIO_ROOT_PASSWORD: credentials.secretAccessKey,
    })
    .withExposedPorts(MINIO_PORT)
    .withWaitStrategy(Wait.forHttp('/minio/health/live', MINIO_PORT))
    .start();

  const storage: BucketStorage = {
    bucket,
    region: 'us-east-1',
    endpoint: `http://${container.getHost()}:${container.getMappedPort(MINIO_PORT)}`,
    forcePathStyle: true,
    credentials,
  };

  const client = new S3Client({
    region: storage.region,
    endpoint: storage.endpoint,
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
    storage,
    configModule: () => ({
      module: class MinioStorageConfig {},
      providers: [{ provide: storageConfig.KEY, useValue: storage }],
      exports: [storageConfig.KEY],
    }),
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
