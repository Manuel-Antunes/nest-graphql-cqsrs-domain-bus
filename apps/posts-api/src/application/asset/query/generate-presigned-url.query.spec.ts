import { CqrsModule, QueryBus } from '@nestjs/cqrs';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { DiskService } from '@nestposts/asset/domain/storage/disk.service';
import { AssetInfrastructureModule } from '@nestposts/asset/infrastructure/asset-infrastructure.module';
import type { TestStorage } from '@nestposts/asset/infrastructure/testing/test-storage';
import { setupTestStorage } from '@nestposts/asset/infrastructure/testing/test-storage';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';

import { GeneratePresignedUrlQuery } from './generate-presigned-url.query';

describe('GeneratePresignedUrlQuery.Handler', () => {
  let storage: TestStorage;
  let module: TestingModule;
  const uploader = UserId.generate();

  const generate = (mimeType = 'text/plain') =>
    module
      .get(QueryBus)
      .execute(
        new GeneratePresignedUrlQuery.GeneratePresignedUrl(uploader, mimeType),
      );

  beforeAll(async () => {
    storage = await setupTestStorage();
    module = await Test.createTestingModule({
      imports: [
        CqrsModule.forRoot(),
        AssetInfrastructureModule.forRoot({
          ...storage.options,
          attachments: false,
        }),
      ],
      providers: [GeneratePresignedUrlQuery.Handler],
    }).compile();
    await module.init();
  });

  afterAll(async () => {
    await module?.close();
    await storage?.stop();
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
    const disk = module.get(DiskService).getDisk();
    await expect(disk.get(key)).resolves.toBe('uploaded-bytes');
    await expect(disk.getMetaData(key)).resolves.toMatchObject({
      contentType: 'text/plain',
    });
  });
});
