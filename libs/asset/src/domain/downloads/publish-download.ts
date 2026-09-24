import { randomBytes } from 'node:crypto';
import type { Disk } from 'flydrive';

const TOKEN_BYTES = 16;

/**
 * Where generated downloads are written. The prefix is expected to be publicly readable and expired
 * by a bucket lifecycle rule, which is what lets a download link be short and unsigned.
 */
export const DOWNLOAD_KEY_PREFIX = 'tmp/downloads';

/** How long the bucket keeps a download. Mirror the lifecycle rule on the prefix. */
export const DOWNLOAD_TTL_SECONDS = 24 * 60 * 60;

export interface PublishedDownload {
  key: string;
  url: string;
  /** Epoch milliseconds after which the object is gone. */
  expiresAt: number;
  sizeBytes: number;
}

/**
 * Stores a generated file under an unguessable key and returns an unsigned URL for it.
 *
 * The random path segment is the capability, so the URL stays short enough to be copied by hand (or
 * relayed by a language model) without breaking, where a presigned URL runs to well over a thousand
 * characters. The link lives exactly as long as the object does.
 */
export async function publishDownload(
  disk: Disk,
  fileName: string,
  contents: Buffer,
  contentType: string,
): Promise<PublishedDownload> {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  const key = `${DOWNLOAD_KEY_PREFIX}/${token}/${fileName}`;

  await disk.put(key, contents, { contentType });

  return {
    key,
    url: await disk.getUrl(key),
    expiresAt: Date.now() + DOWNLOAD_TTL_SECONDS * 1000,
    sizeBytes: contents.length,
  };
}
