// biome-ignore-all lint/complexity/noThisInStatic: the static constructors build the class they are called on — Attachment.fromBuffer makes an Attachment — which naming Asset instead would undo
import { randomUUID } from 'node:crypto';
import { posix } from 'node:path';
import type { Readable } from 'node:stream';
import type { Disk } from 'flydrive';
import type { SignedURLOptions } from 'flydrive/types';

import {
  AssetAlreadyStoredException,
  DiskNotBoundException,
  NotABufferException,
  NotBase64Exception,
} from '../errors/attachment.exceptions';
import type { FileFacts } from '../file/file-inspector';
import { FileInspector } from '../file/file-inspector';
import { TemporaryFile } from '../file/temporary-file';
import type { UploadedFile } from '../file/uploaded-file';
import { UploadedFiles } from '../file/uploaded-file';
import type { DiskResolver } from './asset-source';
import { AssetSource } from './asset-source';
import type { AssetMeta } from './schemas/asset-meta.schema';
import type { StoredAsset } from './schemas/stored-asset.schema';

/** What an asset is made of: where it is stored, when it is, and what it is. */
export interface AssetAttributes {
  disk?: string;
  path?: string;
  originalName?: string;
  size: number;
  extname: string;
  mimeType: string;
  meta?: AssetMeta;
}

/** The metadata of an object {@link Asset.fromDisk} is made of, which only the uploader knows. */
export interface DiskObjectAttributes {
  /** The disk the object is on, when it is not the one the asset is stored on. */
  disk?: string;
  size: number;
  mimeType: string;
  extname?: string;
  originalName?: string;
  /** Leave the object where it is once it is copied into place, instead of deleting it. */
  keepSource?: boolean;
}

/** Where an asset is stored: a disk, and the key on it. */
export interface AssetPlacement {
  disk: string;
  path: string;
}

export type AssetConstructor<T extends Asset> = new (
  attributes: AssetAttributes,
  source?: AssetSource,
) => T;

const UNKNOWN_MIME_TYPE = 'application/octet-stream';

const DATA_URI_PREFIX = /^data:([A-Za-z-+/.]+);base64,/;

const BASE64 =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/** What storing an asset left to do: `commit` once the write is final, or `undo` it. */
export class AssetWrite {
  constructor(
    private readonly onCommit: () => Promise<void>,
    private readonly onUndo: () => Promise<void>,
  ) {}

  /** Lets go of the source: a temporary file, or a staged object nobody needs any more. */
  commit(): Promise<void> {
    return this.onCommit();
  }

  /** Deletes what was written and puts the asset back as it was, source included. */
  undo(): Promise<void> {
    return this.onUndo();
  }
}

/**
 * A file on a disk: `@jrmc/adonis-attachment`'s `AttachmentBase`. An {@link Attachment} and each of
 * its {@link Variant}s are assets.
 *
 * An asset made by one of the static constructors is **pending**: it knows what it is — extension,
 * MIME type, size — and where its bytes are, but it is stored nowhere yet. The attachment subscriber
 * stores it when the entity holding it is flushed; {@link store} is how anything else does.
 *
 * ```ts
 * post.cover = await Attachment.fromBuffer(bytes, 'cover.png');
 * post.cover = await Attachment.fromPath('/tmp/report.pdf');
 * post.cover = await Attachment.fromUrl('https://example.com/photo.jpg');
 * post.cover = await Attachment.fromBase64('data:image/png;base64,iVBOR…', 'pixel.png');
 * post.cover = await Attachment.fromStream(stream, 'video.mkv');
 * post.cover = await Attachment.fromFile(request.file);
 * post.cover = Attachment.fromDisk('tmp/uploads/1234', { size, mimeType: 'image/png' });
 * ```
 *
 * A stored asset is **bound** to the disk it lives on once it is loaded or stored, and reads,
 * streams and URLs go through that disk.
 */
export class Asset {
  /** The name of the disk the asset is stored on. */
  disk?: string;

  /** The key on the disk; empty while the asset is pending. */
  path: string;

  /** The name the file had where it came from. */
  originalName: string;

  size: number;
  extname: string;
  mimeType: string;

  /** What was read from the file itself — dimensions, EXIF, duration — when `meta` is on. */
  meta?: AssetMeta;

  /** The URL computed by {@link computeUrl}, signed for a private disk. */
  url?: string;

  #source?: AssetSource;
  #bound?: Disk;

  constructor(attributes: AssetAttributes, source?: AssetSource) {
    this.disk = attributes.disk;
    this.path = attributes.path ?? '';
    this.size = attributes.size;
    this.extname = attributes.extname;
    this.mimeType = attributes.mimeType;
    this.meta = attributes.meta;
    this.originalName =
      attributes.originalName ??
      (this.path
        ? posix.basename(this.path)
        : `${randomUUID()}.${attributes.extname}`);
    this.#source = source;
  }

  /** An asset of bytes in memory. The name only helps tell what they are, and is kept as the original. */
  static async fromBuffer<T extends Asset>(
    this: AssetConstructor<T>,
    buffer: Buffer,
    name?: string,
  ): Promise<T> {
    if (!Buffer.isBuffer(buffer)) {
      throw new NotABufferException();
    }
    return Asset.pending(
      this,
      AssetSource.local(buffer),
      await FileInspector.ofBuffer(buffer, name),
      name,
    );
  }

  /** An asset of base64 bytes, bare or as a `data:` URI. */
  static async fromBase64<T extends Asset>(
    this: AssetConstructor<T>,
    data: string,
    name?: string,
  ): Promise<T> {
    const buffer = Asset.decodeBase64(data);
    return Asset.pending(
      this,
      AssetSource.local(buffer),
      await FileInspector.ofBuffer(buffer, name),
      name,
    );
  }

  /** An asset of a local file, which is copied — never moved — when the asset is stored. */
  static async fromPath<T extends Asset>(
    this: AssetConstructor<T>,
    path: string,
    name?: string,
  ): Promise<T> {
    return Asset.pending(
      this,
      AssetSource.local(path),
      await FileInspector.ofPath(path, name),
      name ?? posix.basename(path),
    );
  }

  /** An asset of whatever `url` answers with, downloaded now to a temporary file. */
  static async fromUrl<T extends Asset>(
    this: AssetConstructor<T>,
    url: URL | string,
    name?: string,
  ): Promise<T> {
    const { path, contentType } = await TemporaryFile.fromUrl(url);
    const fileName = name ?? Asset.fileNameOf(url);
    return Asset.pending(
      this,
      AssetSource.local(path, { temporary: true }),
      Asset.preferKnown(
        await FileInspector.ofPath(path, fileName),
        contentType,
      ),
      fileName,
    );
  }

  /** An asset of a stream, drained now to a temporary file. */
  static async fromStream<T extends Asset>(
    this: AssetConstructor<T>,
    stream: NodeJS.ReadableStream,
    name?: string,
  ): Promise<T> {
    const path = await TemporaryFile.fromStream(
      stream,
      FileInspector.extensionOf(name),
    );
    return Asset.pending(
      this,
      AssetSource.local(path, { temporary: true }),
      await FileInspector.ofPath(path, name),
      name,
    );
  }

  /** An asset of a file a request carried — multer's, `@fastify/multipart`'s or AdonisJS's. */
  static fromFile<T extends Asset>(
    this: AssetConstructor<T>,
    file: UploadedFile,
  ): Promise<T> {
    return Asset.uploaded(this, file);
  }

  /** One asset per file a request carried. */
  static fromFiles<T extends Asset>(
    this: AssetConstructor<T>,
    files: readonly UploadedFile[],
  ): Promise<T[]> {
    return Promise.all(files.map((file) => Asset.uploaded(this, file)));
  }

  /**
   * An asset of an object already on a disk — what a browser uploaded to a signed URL. Storing it
   * copies the object into place, and deletes it once the copy is final unless `keepSource`.
   *
   * The object is TAKEN: whoever calls this must know the key is one the caller may take, since
   * storing it removes it from where it was.
   */
  static fromDisk<T extends Asset>(
    this: AssetConstructor<T>,
    key: string,
    attributes: DiskObjectAttributes,
  ): T {
    const extname =
      attributes.extname ??
      FileInspector.extensionOf(attributes.originalName) ??
      FileInspector.extensionOf(key) ??
      'bin';
    return new this(
      {
        size: attributes.size,
        mimeType: attributes.mimeType,
        extname,
        originalName: attributes.originalName ?? posix.basename(key),
      },
      AssetSource.disk(key, {
        disk: attributes.disk,
        keepSource: attributes.keepSource,
      }),
    );
  }

  /** The file name: the last segment of {@link path}, or the original name while pending. */
  get name(): string {
    return posix.basename(this.path) || this.originalName;
  }

  /** The folder the file is in, if it is in one. */
  get folder(): string | undefined {
    const folder = posix.dirname(this.path);
    return folder === '.' || folder === '/' ? undefined : folder;
  }

  /** Whether the asset still has to be stored. */
  get pending(): boolean {
    return this.#source !== undefined;
  }

  /** Where the bytes of a pending asset are. */
  get source(): AssetSource | undefined {
    return this.#source;
  }

  /** Whether the asset knows the disk it is stored on. */
  get bound(): boolean {
    return this.#bound !== undefined;
  }

  bindTo(disk: Disk): this {
    this.#bound = disk;
    return this;
  }

  /** The flydrive disk the asset is stored on. */
  getDisk(): Disk {
    if (!this.#bound) {
      throw new DiskNotBoundException(this.path || this.originalName);
    }
    return this.#bound;
  }

  getBytes(): Promise<Uint8Array> {
    return this.getDisk().getBytes(this.path);
  }

  async getBuffer(): Promise<Buffer> {
    return Buffer.from(await this.getBytes());
  }

  getStream(): Promise<Readable> {
    return this.getDisk().getStream(this.path);
  }

  getUrl(): Promise<string> {
    return this.getDisk().getUrl(this.path);
  }

  getSignedUrl(options?: SignedURLOptions): Promise<string> {
    return this.getDisk().getSignedUrl(this.path, options);
  }

  /** Resolves and keeps {@link url}: signed when the object is private, plain otherwise. */
  async computeUrl(options?: SignedURLOptions): Promise<string> {
    const disk = this.getDisk();
    const visibility = await disk.getVisibility(this.path);
    this.url =
      visibility === 'private'
        ? await disk.getSignedUrl(this.path, options)
        : await disk.getUrl(this.path);
    return this.url;
  }

  /**
   * Writes a pending asset at `placement` and binds it there. The source is left alone until the
   * returned {@link AssetWrite} is committed; undoing it deletes the copy and makes the asset
   * pending again.
   */
  async store(
    drive: DiskResolver,
    placement: AssetPlacement,
    options: { keepSource?: boolean } = {},
  ): Promise<AssetWrite> {
    const source = this.#source;
    if (!source) {
      throw new AssetAlreadyStoredException(this.path);
    }
    const previous = { disk: this.disk, path: this.path };
    await source.writeTo(drive, { ...placement, contentType: this.mimeType });

    this.#source = undefined;
    this.disk = placement.disk;
    this.path = placement.path;
    this.url = undefined;
    this.bindTo(drive.use(placement.disk));

    return new AssetWrite(
      () => source.release(drive, placement.disk, options.keepSource),
      async () => {
        await drive.use(placement.disk).delete(placement.path);
        this.#source = source;
        this.disk = previous.disk;
        this.path = previous.path;
        this.url = undefined;
        this.#bound = undefined;
      },
    );
  }

  /** Deletes the stored object. */
  async remove(): Promise<void> {
    await this.getDisk().delete(this.path);
  }

  /** What a column keeps: the durable fields, and never the URL, which is derived and may expire. */
  toObject(): StoredAsset {
    return Asset.compact({
      disk: this.disk,
      path: this.path,
      originalName: this.originalName,
      size: this.size,
      extname: this.extname,
      mimeType: this.mimeType,
      meta: this.meta,
    });
  }

  toJSON(): Record<string, unknown> {
    return Asset.compact({
      name: this.name,
      path: this.path,
      originalName: this.originalName,
      size: this.size,
      extname: this.extname,
      mimeType: this.mimeType,
      meta: this.meta,
      url: this.url,
    });
  }

  protected static compact<T extends object>(value: T): T {
    return Object.fromEntries(
      Object.entries(value).filter(([, entry]) => entry !== undefined),
    ) as T;
  }

  private static pending<T extends Asset>(
    klass: AssetConstructor<T>,
    source: AssetSource,
    facts: FileFacts,
    name?: string,
  ): T {
    return new klass(
      { ...facts, originalName: name ?? `${randomUUID()}.${facts.extname}` },
      source,
    );
  }

  private static async uploaded<T extends Asset>(
    klass: AssetConstructor<T>,
    file: UploadedFile,
  ): Promise<T> {
    const { input, name, mimeType } = UploadedFiles.contentsOf(file);
    return Asset.pending(
      klass,
      AssetSource.local(input),
      Asset.preferKnown(await FileInspector.of(input, name), mimeType),
      name,
    );
  }

  private static preferKnown(facts: FileFacts, mimeType?: string): FileFacts {
    return facts.mimeType === UNKNOWN_MIME_TYPE && mimeType
      ? { ...facts, mimeType }
      : facts;
  }

  private static decodeBase64(data: string): Buffer {
    const base64 = data.replace(DATA_URI_PREFIX, '');
    if (!BASE64.test(base64)) {
      throw new NotBase64Exception();
    }
    return Buffer.from(base64, 'base64');
  }

  private static fileNameOf(url: URL | string): string | undefined {
    return posix.basename(new URL(url).pathname) || undefined;
  }
}
