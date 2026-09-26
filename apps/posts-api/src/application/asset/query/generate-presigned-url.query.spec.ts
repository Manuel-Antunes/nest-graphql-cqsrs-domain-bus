import { CqrsModule, QueryBus } from '@nestjs/cqrs';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { Drive } from '@nestposts/asset/infrastructure/drive/drive';
import { DriveModule } from '@nestposts/asset/infrastructure/drive/drive.module';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';

import type { MinioStorage } from '../../../../test/support/minio-storage';
import { startMinioStorage } from '../../../../test/support/minio-storage';
import { BucketDisks } from '../../../infrastructure/storage/bucket-disks';
import { GeneratePresignedUrlQuery } from './generate-presigned-url.query';

describe('GeneratePresignedUrlQuery.Handler', () => {
  let minio: MinioStorage;
  let module: TestingModule;
  const uploader = UserId.generate();

  const generate = (mimeType = 'text/plain') =>
    module
      .get(QueryBus)
      .execute(
        new GeneratePresignedUrlQuery.GeneratePresignedUrl(uploader, mimeType),
      );

  beforeAll(async () => {
    minio = await startMinioStorage();
    module = await Test.createTestingModule({
      imports: [
        CqrsModule.forRoot(),
        DriveModule.forRootAsync({
          imports: [minio.configModule()],
          useClass: BucketDisks,
        }),
      ],
      providers: [GeneratePresignedUrlQuery.Handler],
    }).compile();
    await module.init();
  });

  afterAll(async () => {
    await module?.close();
    await minio?.stop();
  });

  it('signs a key in the uploader’s staging area', async () => {
    const { key, url } = await generate();

    expect(key).toMatch(new RegExp(`^tmp/${uploader.value}/`));
    expect(url).toContain('X-Amz-Signature');
  });

  it('is a URL the storage accepts the file on, landing at the key it answered with', async () => {
    const { key, url } = await generate('text/plain');

    const put = await fetch(url, {
      method: 'PUT',
      headers: { 'content-type': 'text/plain' },
      body: 'uploaded-bytes',
    });

    expect(put.status).toBe(200);
    const disk = module.get(Drive).use();
    await expect(disk.get(key)).resolves.toBe('uploaded-bytes');
    await expect(disk.getMetaData(key)).resolves.toMatchObject({
      contentType: 'text/plain',
    });
  });
});
