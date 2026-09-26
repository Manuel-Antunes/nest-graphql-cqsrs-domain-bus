import { Storage } from '@nestjs/storage';
import type { TestingModule } from '@nestjs/testing';
import { AttachmentModule } from '@nestposts/asset/infrastructure/attachment.module';
import { TestDisks } from '@nestposts/asset/infrastructure/testing/test-disks';
import type { UserId } from '@nestposts/users/domain/user/vo/user-id';

import type { AssetUpload } from '../../src/application/asset/upload-area';
import { UploadArea } from '../../src/application/asset/upload-area';

export const attachments = () => [
  TestDisks.module(),
  AttachmentModule.forRoot({}),
];

export async function givenAnUpload(
  module: TestingModule,
  uploader: UserId,
  body = 'image-bytes',
): Promise<AssetUpload> {
  const key = UploadArea.keyFor(uploader);
  await module.get(Storage).disk().put(key, body);
  return {
    name: key,
    size: body.length,
    extname: 'png',
    mimeType: 'image/png',
  };
}

export const storedIn = (module: TestingModule, key: string) =>
  module.get(Storage).disk().exists(key);

export const contentsOf = (module: TestingModule, key: string) =>
  module.get(Storage).disk().getText(key);
