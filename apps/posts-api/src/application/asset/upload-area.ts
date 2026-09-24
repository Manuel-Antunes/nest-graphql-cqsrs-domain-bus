import { randomUUID } from 'node:crypto';
import { Asset } from '@nestposts/asset/domain/data-objects/asset';
import type { IAsset } from '@nestposts/asset/domain/schemas/asset.schema';
import type { UserId } from '@nestposts/users/domain/user/vo/user-id';

export type AssetUpload = Pick<
  IAsset,
  'name' | 'size' | 'extname' | 'mimeType'
>;

export class UploadNotOwnedException extends Error {
  constructor(
    readonly key: string,
    readonly uploaderId: UserId,
  ) {
    super(`${key} is not an upload of ${uploaderId.value}`);
    this.name = 'UploadNotOwnedException';
  }
}

const prefixOf = (uploader: UserId): string => `tmp/${uploader.value}/`;

export const UploadArea = {
  keyFor(uploader: UserId): string {
    return `${prefixOf(uploader)}${Date.now()}-${randomUUID()}`;
  },

  stage(upload: AssetUpload, uploader: UserId): Asset {
    if (
      !upload.name.startsWith(prefixOf(uploader)) ||
      upload.name.includes('..')
    ) {
      throw new UploadNotOwnedException(upload.name, uploader);
    }
    return new Asset({
      name: upload.name,
      size: upload.size,
      extname: upload.extname,
      mimeType: upload.mimeType,
      persisted: false,
    });
  },
};
