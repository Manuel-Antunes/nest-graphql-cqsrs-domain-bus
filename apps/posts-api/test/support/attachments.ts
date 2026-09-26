import type { TestingModule } from '@nestjs/testing';
import { AttachmentModule } from '@nestposts/asset/infrastructure/attachment.module';
import { Drive } from '@nestposts/asset/infrastructure/drive/drive';
import { DriveModule } from '@nestposts/asset/infrastructure/drive/drive.module';
import type { TestDrive } from '@nestposts/asset/infrastructure/testing/test-drive';
import type { UserId } from '@nestposts/users/domain/user/vo/user-id';

import type { AssetUpload } from '../../src/application/asset/upload-area';
import { UploadArea } from '../../src/application/asset/upload-area';

export const attachmentsOn = (drive: TestDrive) => [
  DriveModule.forRoot(drive.options),
  AttachmentModule.forRoot({}),
];

export async function givenAnUpload(
  module: TestingModule,
  uploader: UserId,
  body = 'image-bytes',
): Promise<AssetUpload> {
  const key = UploadArea.keyFor(uploader);
  await module.get(Drive).use().put(key, body);
  return {
    name: key,
    size: body.length,
    extname: 'png',
    mimeType: 'image/png',
  };
}

export const storedIn = (module: TestingModule, key: string) =>
  module.get(Drive).use().exists(key);

export const contentsOf = (module: TestingModule, key: string) =>
  module.get(Drive).use().get(key);
