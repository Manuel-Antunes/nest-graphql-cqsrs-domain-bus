import { Inject, Injectable, Logger } from '@nestjs/common';
import type { StorageSignedUrlRequest } from '@nestjs/storage';
import { Storage } from '@nestjs/storage';

import type { Asset, AssetWrite } from '../domain/asset/asset';
import { Attachment } from '../domain/asset/attachment';
import type { ConverterContext } from '../domain/converter/converter';
import type {
  AttachmentDefaults,
  AttachmentOptions,
  AttachmentOwner,
  ResolvedAttachmentOptions,
} from '../domain/options/attachment-options';
import type { VariantLayout } from '../domain/options/attachment-path';
import { AttachmentPath } from '../domain/options/attachment-path';
import type { AttachmentModuleOptions } from './attachment.options';
import { ATTACHMENT_OPTIONS } from './attachment.options';
import type { AttachmentKeyPayload } from './keys/attachment-keys';
import { AttachmentKeys } from './keys/attachment-keys';
import { MediaMeta } from './media/media-meta';
import { ConverterRegistry } from './variants/converter-registry';

const DEFAULT_TIMEOUT = 30_000;

/** Where a stored asset can be put, when it is not attached to anything. */
export interface StandalonePlacement {
  disk?: string;
  folder?: string;
  /** `true` for a random name, `false` for the original, or the name itself. */
  name?: boolean | string;
}

/**
 * Stores, binds, resolves and deletes assets under the module's configuration —
 * `@jrmc/adonis-attachment`'s `AttachmentManager`, minus the `createFrom*` factories, which are the
 * static constructors of {@link Attachment} and `Asset` here.
 *
 * The attachment subscriber is what calls it for every `attachment()` column. Anything else can too:
 *
 * ```ts
 * constructor(private readonly attachments: AttachmentManager) {}
 *
 * await this.attachments.computeUrl(post.cover, { expiresIn: '30m' });
 * const report = await this.attachments.store(await Asset.fromBuffer(pdf, 'report.pdf'), {
 *   folder: 'reports',
 * });
 * ```
 */
@Injectable()
export class AttachmentManager {
  private readonly logger = new Logger(AttachmentManager.name);

  readonly defaults: AttachmentDefaults;
  readonly layout: VariantLayout;
  readonly context: ConverterContext;

  constructor(
    @Inject(ATTACHMENT_OPTIONS)
    private readonly options: AttachmentModuleOptions,
    readonly storage: Storage,
    readonly converters: ConverterRegistry,
    readonly keys: AttachmentKeys,
  ) {
    this.defaults = {
      folder: options.folder ?? 'uploads',
      rename: options.rename ?? true,
      preComputeUrl: options.preComputeUrl ?? false,
      meta: options.meta ?? false,
      keepSource: options.keepSource ?? false,
    };
    this.layout = options.variant ?? {};
    this.context = {
      bin: options.bin ?? {},
      timeout: options.timeout ?? DEFAULT_TIMEOUT,
    };
  }

  /** The options of a column, with every strategy evaluated for `owner` over the module's defaults. */
  resolve(
    declared: AttachmentOptions | undefined,
    owner: AttachmentOwner,
  ): Promise<ResolvedAttachmentOptions> {
    return AttachmentPath.resolve(declared, this.defaults, owner);
  }

  /** What a converter is handed for `asset`. */
  contextFor(asset: Asset): ConverterContext {
    return {
      ...this.context,
      file: { extname: asset.extname, mimeType: asset.mimeType },
    };
  }

  /** The disk `asset` is on — or goes to: its own, the column's, or the storage's default. */
  diskOf(asset: Asset, fallback?: string): string {
    return asset.disk ?? fallback ?? this.storage.defaultDisk;
  }

  /** Binds `asset` — and, for an attachment, each of its variants — to the disk it is stored on. */
  bind<T extends Asset>(asset: T, fallbackDisk?: string): T {
    const disk = this.diskOf(asset, fallbackDisk);
    asset.bindTo(this.storage.disk(disk));
    if (asset instanceof Attachment) {
      for (const variant of asset.variants) {
        if (variant.disk && variant.disk !== disk) {
          variant.bindTo(this.storage.disk(variant.disk));
        } else if (!variant.bound) {
          variant.bindTo(this.storage.disk(disk));
        }
      }
    }
    return asset;
  }

  /**
   * Makes a loaded attachment usable: bound to its disk, its URLs resolved when `preComputeUrl`, and
   * its key id sealed when there is a secret and a location.
   */
  async prepare(
    attachment: Attachment,
    options: ResolvedAttachmentOptions,
    location?: AttachmentKeyPayload,
  ): Promise<void> {
    this.bind(attachment, options.disk);
    if (options.preComputeUrl) {
      await attachment.computeUrls(this.options.signedUrl);
    }
    if (location) {
      attachment.keyId = this.keys.seal(location);
    }
  }

  /**
   * Stores a pending asset where `options` put it — reading its metadata first when `meta` is on —
   * and answers with what is left to do once the write is final.
   */
  async write(
    asset: Asset,
    options: ResolvedAttachmentOptions,
    entity?: object,
  ): Promise<AssetWrite> {
    const disk = this.diskOf(asset, options.disk);
    const path = AttachmentPath.of(asset, options, entity);
    if (options.meta && asset.source) {
      asset.meta = await this.metaOf(asset, disk);
    }
    const write = await asset.store(
      this.storage,
      { disk, path },
      { keepSource: options.keepSource },
    );
    if (options.preComputeUrl) {
      await this.computeUrl(asset);
    }
    return write;
  }

  /** Stores a pending asset outside any entity, at once, and answers with it stored. */
  async store<T extends Asset>(
    asset: T,
    placement: StandalonePlacement = {},
  ): Promise<T> {
    const options = await this.resolve(
      {
        disk: placement.disk,
        folder: placement.folder,
        rename: placement.name,
      },
      { path: [], originalName: asset.originalName },
    );
    const write = await this.write(asset, options);
    await write.commit();
    return asset;
  }

  /** Deletes a stored asset — and, for an attachment, every variant — binding it first if need be. */
  async remove(asset: Asset, fallbackDisk?: string): Promise<void> {
    if (!asset.bound) {
      this.bind(asset, fallbackDisk);
    }
    await asset.remove();
  }

  /**
   * Resolves and keeps the URL of `asset` — of an attachment and all its variants — signed when the
   * object is private: `@jrmc/adonis-attachment`'s `attachmentManager.computeUrl`.
   */
  async computeUrl(
    asset: Asset,
    signedUrlOptions: StorageSignedUrlRequest | undefined = this.options
      .signedUrl,
  ): Promise<void> {
    if (!asset.bound) {
      this.bind(asset);
    }
    if (asset instanceof Attachment) {
      await asset.computeUrls(signedUrlOptions);
    } else {
      await asset.computeUrl(signedUrlOptions);
    }
  }

  private async metaOf(asset: Asset, disk: string) {
    try {
      const input = await asset.source?.read(this.storage, disk);
      return input === undefined
        ? undefined
        : await MediaMeta.read(input, asset.mimeType, this.context);
    } catch (error) {
      this.logger.warn(
        `Could not read the metadata of ${asset.originalName}: ${error instanceof Error ? error.message : String(error)}`,
      );
      return undefined;
    }
  }
}
