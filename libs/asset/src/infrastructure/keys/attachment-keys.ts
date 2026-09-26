import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

/** What an attachment's key id points at: the row, and the property the attachment is held by. */
export interface AttachmentKeyPayload {
  entity: string;
  schema?: string;
  where: Record<string, unknown>;
  path: readonly string[];
  /** The attachment's stored key, which picks it out of an `attachments()` column. */
  key: string;
}

const IV_BYTES = 12;
const TAG_BYTES = 16;

/**
 * Seals a reference to an attachment into an opaque key id, and opens it again — what
 * `@jrmc/adonis-attachment` does with the application's encryption. AES-256-GCM under a key derived
 * from the module's `secret`: a key id cannot be forged, altered or read, so the attachments route
 * can serve whatever it points at. Without a secret there are no key ids.
 */
export class AttachmentKeys {
  private readonly key?: Buffer;

  constructor(secret?: string) {
    this.key = secret
      ? createHash('sha256').update(secret, 'utf8').digest()
      : undefined;
  }

  get enabled(): boolean {
    return this.key !== undefined;
  }

  seal(payload: AttachmentKeyPayload): string | undefined {
    if (!this.key) return undefined;
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const body = Buffer.concat([
      cipher.update(JSON.stringify(payload), 'utf8'),
      cipher.final(),
    ]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
  }

  /** The payload of `keyId`, or nothing when it was not sealed with this secret. */
  open(keyId: string): AttachmentKeyPayload | undefined {
    if (!this.key) return undefined;
    try {
      const sealed = Buffer.from(keyId, 'base64url');
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.key,
        sealed.subarray(0, IV_BYTES),
      );
      decipher.setAuthTag(sealed.subarray(IV_BYTES, IV_BYTES + TAG_BYTES));
      const body = Buffer.concat([
        decipher.update(sealed.subarray(IV_BYTES + TAG_BYTES)),
        decipher.final(),
      ]);
      return JSON.parse(body.toString('utf8')) as AttachmentKeyPayload;
    } catch {
      return undefined;
    }
  }
}
