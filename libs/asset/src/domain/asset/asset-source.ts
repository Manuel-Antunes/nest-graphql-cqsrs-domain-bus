import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { StorageDisk } from '@nestjs/storage';

import type { LocalInput } from '../file/local-input';
import { TemporaryFile } from '../file/temporary-file';

/** Anything that hands out a disk by name — `@nestjs/storage`'s `Storage` is one. */
export interface DiskResolver {
  disk(name?: string): StorageDisk;
}

/** Where an asset's bytes are being stored: the disk, the key on it, and what they are. */
export interface SourceTarget {
  disk: string;
  path: string;
  contentType: string;
}

/**
 * Where the bytes of an asset come from until they are stored: a local file or buffer, or an object
 * already on a disk that is copied into place — a browser's upload to a signed URL, typically.
 *
 * Writing never consumes the source. It is let go of only once the write is final
 * ({@link release}), which is what lets a rolled-back transaction put an attachment back exactly as
 * it was: the source still there, the copy deleted.
 */
export abstract class AssetSource {
  /** Bytes this process has: a buffer, or a path. A `temporary` path is deleted once stored. */
  static local(
    input: LocalInput,
    options: { temporary?: boolean } = {},
  ): AssetSource {
    return new LocalSource(input, options.temporary ?? false);
  }

  /**
   * An object already on a disk — the disk the asset is stored on, unless `disk` names another. It
   * is deleted once the copy is final, unless `keepSource`.
   */
  static disk(
    key: string,
    options: { disk?: string; keepSource?: boolean } = {},
  ): AssetSource {
    return new DiskSource(key, options.disk, options.keepSource ?? false);
  }

  /** The bytes, when this process already has them. */
  get local(): LocalInput | undefined {
    return undefined;
  }

  abstract writeTo(storage: DiskResolver, target: SourceTarget): Promise<void>;

  /** The bytes, locally, for reading metadata or converting them. */
  abstract read(storage: DiskResolver, disk: string): Promise<LocalInput>;

  /** Lets go of the source once the stored copy is final. */
  abstract release(
    storage: DiskResolver,
    disk: string,
    keepSource?: boolean,
  ): Promise<void>;
}

class LocalSource extends AssetSource {
  constructor(
    private readonly input: LocalInput,
    private readonly temporary: boolean,
  ) {
    super();
  }

  override get local(): LocalInput {
    return this.input;
  }

  async writeTo(
    storage: DiskResolver,
    { disk, path, contentType }: SourceTarget,
  ): Promise<void> {
    const target = storage.disk(disk);
    if (Buffer.isBuffer(this.input)) {
      await target.put(path, this.input, { contentType });
      return;
    }
    const { size } = await stat(this.input);
    await target.put(path, createReadStream(this.input), {
      contentType,
      contentLength: size,
    });
  }

  async read(): Promise<LocalInput> {
    return this.input;
  }

  async release(): Promise<void> {
    if (this.temporary) {
      await TemporaryFile.release(this.input);
    }
  }
}

class DiskSource extends AssetSource {
  constructor(
    private readonly key: string,
    private readonly disk: string | undefined,
    private readonly keepSource: boolean,
  ) {
    super();
  }

  async writeTo(
    storage: DiskResolver,
    { disk, path, contentType }: SourceTarget,
  ): Promise<void> {
    const from = this.disk ?? disk;
    if (from === disk) {
      await storage.disk(disk).copy(this.key, path);
      return;
    }
    const download = await storage.disk(from).get(this.key);
    await storage.disk(disk).put(path, download.body, {
      contentType,
      contentLength: download.size,
    });
  }

  async read(storage: DiskResolver, disk: string): Promise<LocalInput> {
    return storage.disk(this.disk ?? disk).getBuffer(this.key);
  }

  async release(
    storage: DiskResolver,
    disk: string,
    keepSource = false,
  ): Promise<void> {
    if (!this.keepSource && !keepSource) {
      await storage.disk(this.disk ?? disk).delete(this.key);
    }
  }
}
