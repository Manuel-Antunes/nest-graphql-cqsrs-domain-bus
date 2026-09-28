import { randomUUID } from 'node:crypto';

import { Attachment } from './attachment';
import type { AssetUpload } from './schemas/asset-upload.schema';

export class UploadNotOwnedException extends Error {
  constructor(
    readonly key: string,
    readonly uploader: string,
  ) {
    super(`${key} is not an upload of ${uploader}`);
    this.name = 'UploadNotOwnedException';
  }
}

/**
 * Where a browser uploads a file to before anything holds it: `tmp/<uploader>/`, one fresh key per
 * signed URL. {@link Attachment.fromDisk} TAKES the object it is made of, so the key an upload comes
 * back with is staged only when it is one of the uploader's own — a key under somebody else's
 * prefix, or outside the area, is refused.
 *
 * ```ts
 * const key = UploadArea.keyFor(userId);                 // sign a PUT to it
 * post.cover = UploadArea.stage(upload, userId);         // { name: key, size, extname, mimeType }
 * ```
 *
 * Whoever uploads before having an identity — a sign-up — is {@link UploadArea.ANONYMOUS}, and keeps
 * only the key's randomness.
 */
export class UploadArea {
  static readonly ANONYMOUS = 'anonymous';

  static keyFor(uploader: string): string {
    return `${UploadArea.prefixOf(uploader)}${Date.now()}-${randomUUID()}`;
  }

  /** Whether `key` is one {@link keyFor} handed to `uploader`. */
  static owns(uploader: string, key: string): boolean {
    return key.startsWith(UploadArea.prefixOf(uploader)) && !key.includes('..');
  }

  /** What `uploader` uploaded, as a pending attachment — `Attachment.fromDisk` of its key. */
  static stage(upload: AssetUpload, uploader: string): Attachment {
    if (!UploadArea.owns(uploader, upload.name)) {
      throw new UploadNotOwnedException(upload.name, uploader);
    }
    return Attachment.fromDisk(upload.name, {
      size: upload.size,
      extname: upload.extname,
      mimeType: upload.mimeType,
    });
  }

  private static prefixOf(uploader: string): string {
    return `tmp/${uploader}/`;
  }
}
