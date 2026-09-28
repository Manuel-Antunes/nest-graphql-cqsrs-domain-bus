import { Injectable, Logger, Optional } from '@nestjs/common';
import { Attachment } from '@nestposts/asset/domain/asset/attachment';
import type { AssetUpload } from '@nestposts/asset/domain/asset/schemas/asset-upload.schema';
import { AssetUploadSchema } from '@nestposts/asset/domain/asset/schemas/asset-upload.schema';
import { UploadArea } from '@nestposts/asset/domain/asset/upload-area';
import { TemporaryFile } from '@nestposts/asset/domain/file/temporary-file';
import { AttachmentManager } from '@nestposts/asset/infrastructure/attachment-manager';
import { APIError } from 'better-auth/api';

/** Where a write to the user row comes from — Better Auth's endpoint context, when there is one. */
export interface AvatarWriteOrigin {
  readonly path?: string;
  readonly context?: {
    readonly session?: { readonly user: { readonly id: string } } | null;
  };
}

/**
 * Better Auth's `image` is a string on the wire, and an {@link Attachment} on the row: this is the
 * translation between the two, run on every write of a user whatever endpoint caused it. The
 * attachment is always made by one of `Attachment`'s own static constructors, and the attachment
 * subscriber stores it when the row is flushed.
 *
 * | the `image` written | what the row keeps |
 * |---|---|
 * | `undefined` | nothing changes |
 * | `null`, `''` | no avatar — the one there was is deleted with the flush |
 * | the upload `generatePresignedUrl` staged, as JSON | `UploadArea.stage` — `Attachment.fromDisk` of it |
 * | a URL, from a social provider's sign-in | `Attachment.fromUrl` — the picture, stored as ours |
 * | anything else | refused: an avatar is uploaded, never pointed at |
 *
 * An upload is staged as the signed-in user's — `update-user` — or as nobody's, which is what a
 * sign-up has to be. A provider's picture that cannot be downloaded, or is not an image, leaves the
 * user without one: it never fails the sign-in. A process without `AttachmentModule` takes no upload
 * and keeps no provider picture.
 */
@Injectable()
export class AvatarImages {
  private static readonly IMAGE = /^image\/(png|jpeg|webp|gif|avif)$/;

  private static readonly PROVIDER_SIGN_IN =
    /^\/(callback|sign-in\/social)(\/|$)/;

  private static readonly WEB = new Set(['http:', 'https:']);

  private readonly logger = new Logger(AvatarImages.name);

  private readonly storesAttachments: boolean;

  constructor(@Optional() attachments?: AttachmentManager) {
    this.storesAttachments = attachments !== undefined;
  }

  /** `data`, with the `image` it writes turned into what the row keeps. */
  async written<T extends { image?: unknown }>(
    data: T,
    origin?: AvatarWriteOrigin | null,
  ): Promise<T> {
    if (data.image === undefined) {
      return data;
    }
    return { ...data, image: await this.attachmentOf(data.image, origin) } as T;
  }

  private async attachmentOf(
    image: unknown,
    origin?: AvatarWriteOrigin | null,
  ): Promise<Attachment | null> {
    if (image === null || image === '') {
      return null;
    }
    if (image instanceof Attachment) {
      return image;
    }
    if (typeof image !== 'string') {
      throw AvatarImages.notUploaded();
    }
    if (AvatarImages.isProviderPicture(image, origin)) {
      return this.downloaded(image);
    }
    return this.staged(image, origin?.context?.session?.user.id);
  }

  private staged(image: string, userId: string | undefined): Attachment {
    const upload = AvatarImages.uploadOf(image);
    const uploader = userId ?? UploadArea.ANONYMOUS;
    if (
      !upload ||
      !AvatarImages.IMAGE.test(upload.mimeType) ||
      !UploadArea.owns(uploader, upload.name)
    ) {
      throw AvatarImages.notUploaded();
    }
    if (!this.storesAttachments) {
      throw new APIError('NOT_IMPLEMENTED', {
        code: 'AVATARS_NOT_STORED',
        message: 'This service does not store avatars',
      });
    }
    return UploadArea.stage(upload, uploader);
  }

  private async downloaded(url: string): Promise<Attachment | null> {
    if (!this.storesAttachments) {
      return null;
    }
    try {
      const picture = await Attachment.fromUrl(url);
      if (AvatarImages.IMAGE.test(picture.mimeType)) {
        return picture;
      }
      await TemporaryFile.release(picture.source?.local);
      this.logger.warn(
        `The provider's picture at ${url} is a ${picture.mimeType}, not an image an avatar may be`,
      );
    } catch (error) {
      this.logger.warn(
        `The provider's picture at ${url} could not be downloaded: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    return null;
  }

  private static uploadOf(image: string): AssetUpload | null {
    try {
      const parsed = AssetUploadSchema.safeParse(JSON.parse(image));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  private static isProviderPicture(
    image: string,
    origin?: AvatarWriteOrigin | null,
  ): boolean {
    return (
      AvatarImages.PROVIDER_SIGN_IN.test(origin?.path ?? '') &&
      URL.canParse(image) &&
      AvatarImages.WEB.has(new URL(image).protocol)
    );
  }

  private static notUploaded(): APIError {
    return new APIError('BAD_REQUEST', {
      code: 'AVATAR_NOT_UPLOADED',
      message:
        'An avatar is an image uploaded through generatePresignedUrl, by whoever it is for',
    });
  }
}
