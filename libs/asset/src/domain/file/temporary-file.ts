import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream } from 'node:stream/web';

import { CannotGenerateTempFileException } from '../errors/attachment.exceptions';
import type { LocalInput } from './local-input';

const PREFIX = 'nestposts-asset-';

/**
 * Files this library writes to the operating system's temporary directory: a stream or a download
 * an attachment is made of, a buffer an external program has to read from disk, and what such a
 * program writes back. Every one of them carries the same prefix, which is how {@link owns} tells a
 * file this library may delete from one a caller handed it.
 */
export class TemporaryFile {
  /** A fresh path, not yet written, optionally with an extension. */
  static path(extname = ''): string {
    const suffix = extname ? `.${extname.replace(/^\./, '')}` : '';
    return join(tmpdir(), `${PREFIX}${randomUUID()}${suffix}`);
  }

  /** A fresh, empty directory. */
  static directory(): Promise<string> {
    return mkdtemp(join(tmpdir(), PREFIX));
  }

  static async fromBuffer(buffer: Buffer, extname?: string): Promise<string> {
    const path = TemporaryFile.path(extname);
    await writeFile(path, buffer);
    return path;
  }

  static async fromStream(
    stream: NodeJS.ReadableStream,
    extname?: string,
  ): Promise<string> {
    const path = TemporaryFile.path(extname);
    try {
      await pipeline(stream, createWriteStream(path));
      return path;
    } catch (error) {
      await TemporaryFile.remove(path);
      throw new CannotGenerateTempFileException(
        error instanceof Error ? error.message : String(error),
        { cause: error },
      );
    }
  }

  /** Downloads `url`, answering with where it landed and the `Content-Type` it was served as. */
  static async fromUrl(
    url: URL | string,
  ): Promise<{ path: string; contentType?: string }> {
    const response = await fetch(url).catch((error: unknown) => {
      throw new CannotGenerateTempFileException(`${url} could not be reached`, {
        cause: error,
      });
    });
    if (!response.ok || !response.body) {
      throw new CannotGenerateTempFileException(
        `${url} answered ${response.status} ${response.statusText}`,
      );
    }
    const path = await TemporaryFile.fromStream(
      Readable.fromWeb(response.body as ReadableStream<Uint8Array>),
    );
    const contentType = response.headers
      .get('content-type')
      ?.split(';')[0]
      ?.trim();
    return { path, contentType: contentType || undefined };
  }

  /** A path to read `input` from: the path itself, or the buffer written to a temporary file. */
  static pathOf(input: LocalInput, extname?: string): Promise<string> {
    return Buffer.isBuffer(input)
      ? TemporaryFile.fromBuffer(input, extname)
      : Promise.resolve(input);
  }

  /** Whether `path` is one this library wrote, and may therefore delete. */
  static owns(path: unknown): path is string {
    return typeof path === 'string' && path.startsWith(join(tmpdir(), PREFIX));
  }

  static async remove(path: string): Promise<void> {
    await rm(path, { force: true, recursive: true });
  }

  /** Removes `path` when this library wrote it, and leaves anything else alone. */
  static async release(path: unknown): Promise<void> {
    if (TemporaryFile.owns(path)) {
      await TemporaryFile.remove(path);
    }
  }
}
