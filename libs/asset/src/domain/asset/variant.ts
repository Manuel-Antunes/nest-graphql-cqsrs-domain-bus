import type { AssetAttributes } from './asset';
import { Asset } from './asset';
import type { AssetSource } from './asset-source';
import type { StoredVariant } from './schemas/stored-asset.schema';

export interface VariantAttributes extends AssetAttributes {
  /** The name of the converter the variant was made by: `thumbnail`, `preview`. */
  key: string;
  blurhash?: string;
}

/**
 * A file converted from an {@link Attachment} — a thumbnail, a preview — kept inside the attachment's
 * column and stored on the attachment's disk.
 */
export class Variant extends Asset {
  key: string;

  /** A compact placeholder of the image, when its converter asks for one. */
  blurhash?: string;

  constructor(attributes: VariantAttributes, source?: AssetSource) {
    super(attributes, source);
    this.key = attributes.key;
    this.blurhash = attributes.blurhash;
  }

  override toObject(): StoredVariant {
    return Asset.compact({
      ...super.toObject(),
      key: this.key,
      blurhash: this.blurhash,
    });
  }

  override toJSON(): Record<string, unknown> {
    return Asset.compact({
      ...super.toJSON(),
      key: this.key,
      blurhash: this.blurhash,
    });
  }
}
