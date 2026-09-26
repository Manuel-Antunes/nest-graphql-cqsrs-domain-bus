import { randomUUID } from 'node:crypto';
import { Attachment } from '@nestposts/asset/domain/asset/attachment';
import type { UserId } from '@nestposts/users/domain/user/vo/user-id';

export interface AssetUpload {
  name: string;
  size: number;
  extname: string;
  mimeType: string;
}

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

  stage(upload: AssetUpload, uploader: UserId): Attachment {
    if (
      !upload.name.startsWith(prefixOf(uploader)) ||
      upload.name.includes('..')
    ) {
      throw new UploadNotOwnedException(upload.name, uploader);
    }
    return Attachment.fromDisk(upload.name, {
      size: upload.size,
      extname: upload.extname,
      mimeType: upload.mimeType,
    });
  },
};
