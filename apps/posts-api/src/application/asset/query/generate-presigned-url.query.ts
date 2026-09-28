import type { IQueryHandler } from '@nestjs/cqrs';
import { Query, QueryHandler } from '@nestjs/cqrs';
import type { Duration } from '@nestjs/storage';
import { Storage } from '@nestjs/storage';
import { UploadArea } from '@nestposts/asset/domain/asset/upload-area';
import type { UserId } from '@nestposts/users/domain/user/vo/user-id';

export namespace GeneratePresignedUrlQuery {
  export interface PresignedUpload {
    url: string;
    key: string;
  }

  export const UPLOAD_URL_TTL: Duration = '5m';

  export class GeneratePresignedUrl extends Query<PresignedUpload> {
    constructor(
      readonly uploaderId: UserId | null,
      readonly mimeType: string,
    ) {
      super();
    }
  }

  @QueryHandler(GeneratePresignedUrl)
  export class Handler implements IQueryHandler<GeneratePresignedUrl> {
    constructor(private readonly storage: Storage) {}

    async execute(query: GeneratePresignedUrl): Promise<PresignedUpload> {
      const key = UploadArea.keyFor(
        query.uploaderId?.value ?? UploadArea.ANONYMOUS,
      );
      const upload = await this.storage.disk().signedUpload(key, {
        contentType: query.mimeType,
        expiresIn: UPLOAD_URL_TTL,
      });
      return { url: upload.url, key };
    }
  }
}
