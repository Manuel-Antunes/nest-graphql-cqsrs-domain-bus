import type { IQueryHandler } from '@nestjs/cqrs';
import { Query, QueryHandler } from '@nestjs/cqrs';
import { DiskService } from '@nestposts/asset/domain/storage/disk.service';
import type { UserId } from '@nestposts/users/domain/user/vo/user-id';

import { UploadArea } from '../upload-area';

export namespace GeneratePresignedUrlQuery {
  export interface PresignedUpload {
    url: string;
    key: string;
  }

  export const UPLOAD_URL_TTL_SECONDS = 5 * 60;

  export class GeneratePresignedUrl extends Query<PresignedUpload> {
    constructor(
      readonly uploaderId: UserId,
      readonly mimeType: string,
    ) {
      super();
    }
  }

  @QueryHandler(GeneratePresignedUrl)
  export class Handler implements IQueryHandler<GeneratePresignedUrl> {
    constructor(private readonly disks: DiskService) {}

    async execute(query: GeneratePresignedUrl): Promise<PresignedUpload> {
      const key = UploadArea.keyFor(query.uploaderId);
      const url = await this.disks.getDisk().getSignedUploadUrl(key, {
        contentType: query.mimeType,
        expiresIn: UPLOAD_URL_TTL_SECONDS,
      });
      return { url, key };
    }
  }
}
