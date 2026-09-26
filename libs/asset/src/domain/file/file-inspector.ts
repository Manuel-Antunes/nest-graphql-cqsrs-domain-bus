import { open, stat } from 'node:fs/promises';
import { posix } from 'node:path';

import { FileNotFoundException } from '../errors/attachment.exceptions';
import type { LocalInput } from './local-input';
import { OptionalPackage } from './optional-package';

/** What a file is, as far as storing it goes. */
export interface FileFacts {
  extname: string;
  mimeType: string;
  size: number;
}

type FileType = Pick<FileFacts, 'extname' | 'mimeType'>;

const UNKNOWN: FileType = {
  extname: 'bin',
  mimeType: 'application/octet-stream',
};

const SVG: FileType = { extname: 'svg', mimeType: 'image/svg+xml' };

const SVG_SNIFF_BYTES = 64 * 1024;

/**
 * Tells what a file is — extension, MIME type, size — the way `@jrmc/adonis-attachment`'s meta
 * adapter does: a buffer by its bytes (`file-type`, with SVG recognised by its markup), a path by its
 * name first (`mime-types`) and its bytes when the name says nothing. A name that says nothing and
 * bytes nobody recognises make an `application/octet-stream`.
 */
export class FileInspector {
  static of(input: LocalInput, name?: string): Promise<FileFacts> {
    return Buffer.isBuffer(input)
      ? FileInspector.ofBuffer(input, name)
      : FileInspector.ofPath(input, name);
  }

  static async ofBuffer(buffer: Buffer, name?: string): Promise<FileFacts> {
    const type =
      (await FileInspector.sniffBuffer(buffer)) ??
      (await FileInspector.byName(name)) ??
      UNKNOWN;
    return { ...type, size: buffer.byteLength };
  }

  static async ofPath(path: string, name?: string): Promise<FileFacts> {
    const stats = await stat(path).catch((error: unknown) => {
      throw new FileNotFoundException(path, { cause: error });
    });
    const type =
      (await FileInspector.byName(name ?? path)) ??
      (await FileInspector.sniffFile(path)) ??
      UNKNOWN;
    return { ...type, size: stats.size };
  }

  /** The extension `name` ends with, when it is a plain one. */
  static extensionOf(name: string | undefined): string | undefined {
    const extname = posix.extname(name ?? '').slice(1);
    return /^[a-zA-Z0-9]+$/.test(extname) ? extname.toLowerCase() : undefined;
  }

  private static async byName(
    name: string | undefined,
  ): Promise<FileType | undefined> {
    const extname = FileInspector.extensionOf(name);
    if (!extname || !name) return undefined;
    const { lookup } = await OptionalPackage.load(
      'mime-types',
      () => import('mime-types'),
    );
    const mimeType = lookup(name);
    return mimeType ? { extname, mimeType } : undefined;
  }

  private static async sniffBuffer(
    buffer: Buffer,
  ): Promise<FileType | undefined> {
    const { fileTypeFromBuffer } = await FileInspector.fileType();
    const sniffed = await fileTypeFromBuffer(buffer);
    if (FileInspector.mayBeSvg(sniffed?.mime) && FileInspector.isSvg(buffer)) {
      return SVG;
    }
    return sniffed
      ? { extname: sniffed.ext, mimeType: sniffed.mime }
      : undefined;
  }

  private static async sniffFile(path: string): Promise<FileType | undefined> {
    const { fileTypeFromFile } = await FileInspector.fileType();
    const sniffed = await fileTypeFromFile(path);
    if (
      FileInspector.mayBeSvg(sniffed?.mime) &&
      FileInspector.isSvg(await FileInspector.head(path))
    ) {
      return SVG;
    }
    return sniffed
      ? { extname: sniffed.ext, mimeType: sniffed.mime }
      : undefined;
  }

  private static mayBeSvg(mimeType: string | undefined): boolean {
    return (
      mimeType === undefined ||
      mimeType === 'application/xml' ||
      mimeType === 'text/xml'
    );
  }

  private static isSvg(buffer: Buffer): boolean {
    return buffer
      .subarray(0, SVG_SNIFF_BYTES)
      .toString('utf8')
      .includes('<svg');
  }

  private static async head(path: string): Promise<Buffer> {
    const file = await open(path, 'r');
    try {
      const buffer = Buffer.alloc(SVG_SNIFF_BYTES);
      const { bytesRead } = await file.read(buffer, 0, SVG_SNIFF_BYTES, 0);
      return buffer.subarray(0, bytesRead);
    } finally {
      await file.close();
    }
  }

  private static fileType() {
    return OptionalPackage.load('file-type', () => import('file-type'));
  }
}
