import type { TestingModule } from '@nestjs/testing';
import { DiskService } from '@nestposts/asset/domain/storage/disk.service';
import { AssetInfrastructureModule } from '@nestposts/asset/infrastructure/asset-infrastructure.module';
import type { TestStorage } from '@nestposts/asset/infrastructure/testing/test-storage';
import type { UserId } from '@nestposts/users/domain/user/vo/user-id';

import type { AssetUpload } from '../../src/application/asset/upload-area';
import { UploadArea } from '../../src/application/asset/upload-area';

export const attachmentsOn = (storage: TestStorage) => [
  AssetInfrastructureModule.forRoot(storage.options),
];

export async function givenAnUpload(
  module: TestingModule,
  uploader: UserId,
  body = 'image-bytes',
): Promise<AssetUpload> {
  const key = UploadArea.keyFor(uploader);
  await module.get(DiskService).getDisk().put(key, body);
  return {
    name: key,
    size: body.length,
    extname: 'png',
    mimeType: 'image/png',
  };
}

export const storedIn = (module: TestingModule, key: string) =>
  module.get(DiskService).getDisk().exists(key);

export const contentsOf = (module: TestingModule, key: string) =>
  module.get(DiskService).getDisk().get(key);
