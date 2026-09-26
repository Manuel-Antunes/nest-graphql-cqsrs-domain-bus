import type { StorageDisk, StorageSignedUrlRequest } from '@nestjs/storage';

import { CannotCreateAttachmentException } from '../errors/attachment.exceptions';
import type { AssetAttributes } from './asset';
import { Asset } from './asset';
import type { AssetSource } from './asset-source';
import type { StoredAttachment } from './schemas/stored-asset.schema';
import { StoredAttachmentSchema } from './schemas/stored-asset.schema';
import type { VariantAttributes } from './variant';
import { Variant } from './variant';

export interface AttachmentAttributes extends AssetAttributes {
  variants?: readonly VariantAttributes[];
}

/**
 * A file an entity holds: `@jrmc/adonis-attachment`'s `Attachment`. It is an {@link Asset} with the
 * {@link Variant}s its converters made of it, and it is what an `attachment()` column maps.
 *
 * ```ts
 * post.cover = await Attachment.fromBuffer(bytes, 'cover.jpg');
 * await em.flush();
 *
 * post.cover.url;                              // when preComputeUrl is on
 * await post.cover.getUrl('thumbnail');        // a variant's URL, or the original's
 * await post.cover.getSignedUrl('thumbnail', { expiresIn: '30m' });
 * post.cover.getVariant('thumbnail')?.blurhash;
 * ```
 */
export class Attachment extends Asset {
  variants: Variant[];

  /**
   * An opaque, encrypted reference to this attachment — entity, row, property — that the attachments
   * route serves it by. Set on load and on save when the module has a `secret`.
   */
  keyId?: string;

  constructor(attributes: AttachmentAttributes, source?: AssetSource) {
    super(attributes, source);
    this.variants = (attributes.variants ?? []).map(
      (variant) => new Variant(variant),
    );
  }

  /** An attachment as a column stores it, as an object or as its JSON text. */
  static restore(value: unknown): Attachment {
    const parsed = StoredAttachmentSchema.safeParse(
      Attachment.upgrade(typeof value === 'string' ? JSON.parse(value) : value),
    );
    if (!parsed.success) {
      const [issue] = parsed.error.issues;
      throw new CannotCreateAttachmentException(
        issue?.path.join('.') || 'value',
        { cause: parsed.error },
      );
    }
    return new Attachment(parsed.data);
  }

  /** The attachments an `attachments()` column stores. */
  static restoreAll(value: unknown): Attachment[] {
    const list = typeof value === 'string' ? JSON.parse(value) : value;
    return (Array.isArray(list) ? list : []).map((item) =>
      item instanceof Attachment ? item : Attachment.restore(item),
    );
  }

  getVariant(key: string): Variant | null {
    return this.variants.find((variant) => variant.key === key) ?? null;
  }

  /** The URL of the variant `key`, or of the original when there is no such variant. */
  override async getUrl(variant?: string): Promise<string> {
    const found = variant ? this.getVariant(variant) : null;
    return found ? found.getUrl() : super.getUrl();
  }

  /** A signed URL of the variant `key`, or of the original when there is no such variant. */
  override async getSignedUrl(
    variantOrOptions?: string | StorageSignedUrlRequest,
    options?: StorageSignedUrlRequest,
  ): Promise<string> {
    if (typeof variantOrOptions !== 'string') {
      return super.getSignedUrl(variantOrOptions ?? options);
    }
    const found = this.getVariant(variantOrOptions);
    return found ? found.getSignedUrl(options) : super.getSignedUrl(options);
  }

  /** Binds the attachment, and every variant stored on the same disk, to `disk`. */
  override bindTo(disk: StorageDisk): this {
    super.bindTo(disk);
    for (const variant of this.variants) {
      if (!variant.disk || variant.disk === this.disk) {
        variant.bindTo(disk);
      }
    }
    return this;
  }

  /** Resolves and keeps the URL of the original and of every variant. */
  async computeUrls(options?: StorageSignedUrlRequest): Promise<void> {
    await Promise.all([
      this.computeUrl(options),
      ...this.variants.map((variant) => variant.computeUrl(options)),
    ]);
  }

  /** Adds a variant, replacing the one already made by the same converter. */
  putVariant(variant: Variant): this {
    this.variants = [
      ...this.variants.filter((existing) => existing.key !== variant.key),
      variant,
    ];
    return this;
  }

  /** Takes out the variants of `keys`, or every variant, and answers with what it took. */
  takeVariants(keys?: readonly string[]): Variant[] {
    const taken = this.variants.filter(
      (variant) => !keys || keys.includes(variant.key),
    );
    this.variants = this.variants.filter((variant) => !taken.includes(variant));
    return taken;
  }

  /** Deletes the stored object and every variant's. */
  override async remove(): Promise<void> {
    await Promise.all([
      super.remove(),
      ...this.variants.map((variant) => variant.remove()),
    ]);
  }

  override toObject(): StoredAttachment {
    return Asset.compact({
      ...super.toObject(),
      variants:
        this.variants.length > 0
          ? this.variants.map((variant) => variant.toObject())
          : undefined,
    });
  }

  /**
   * What a client is sent, as `@jrmc/adonis-attachment` sends it: the original's fields, and each
   * variant under its own key — `cover.thumbnail.url`.
   */
  override toJSON(): Record<string, unknown> {
    const variants = Object.fromEntries(
      this.variants.map((variant) => [
        variant.key,
        Asset.compact({
          name: variant.name,
          extname: variant.extname,
          mimeType: variant.mimeType,
          meta: variant.meta,
          size: variant.size,
          blurhash: variant.blurhash,
          url: variant.url,
        }),
      ]),
    );
    return Asset.compact({
      keyId: this.keyId,
      name: this.name,
      originalName: this.originalName,
      size: this.size,
      extname: this.extname,
      mimeType: this.mimeType,
      meta: this.meta,
      url: this.url,
      ...variants,
    });
  }

  private static upgrade(value: unknown): unknown {
    if (
      value &&
      typeof value === 'object' &&
      !('path' in value) &&
      'name' in value &&
      typeof value.name === 'string'
    ) {
      return { ...value, path: value.name };
    }
    return value;
  }
}
