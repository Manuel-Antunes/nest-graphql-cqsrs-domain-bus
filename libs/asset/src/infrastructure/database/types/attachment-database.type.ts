import type { Platform } from '@nestposts/database';
import { p, Type } from '@nestposts/database';

import { Asset } from '../../../domain/data-objects/asset';
import type { AssetProps, IAsset } from '../../../domain/schemas/asset.schema';
import type { AttachmentOptions } from '../../../domain/schemas/attachment-options.schema';

/**
 * Maps an {@link Asset} to a `json` column holding its durable fields. It follows MikroORM's own
 * `JsonType`: where the platform converts JSON by itself (Postgres), the value crosses as an object.
 */
export class AttachmentDatabaseType extends Type<
  Asset | null,
  AssetProps | string | null
> {
  constructor(readonly options: AttachmentOptions = {}) {
    super();
  }

  override convertToJSValue(value: unknown): Asset | null {
    if (value == null || value === '') {
      return null;
    }
    if (value instanceof Asset) {
      return value;
    }
    const parsed =
      typeof value === 'string' ? (JSON.parse(value) as AssetProps) : value;
    return new Asset(parsed as AssetProps);
  }

  override convertToDatabaseValue(
    value: Asset | AssetProps | null,
    platform?: Platform,
  ): AssetProps | string | null {
    const asset = this.convertToJSValue(value);
    if (!asset) {
      return null;
    }
    const json = asset.toPersistence();
    return platform?.convertsJsonAutomatically() ? json : JSON.stringify(json);
  }

  override getColumnType(): string {
    return 'json';
  }
}

/**
 * An attachment property for `defineEntity`: a `json` column whose {@link Asset} is attached,
 * resolved and cleaned up by the `AssetAttachmentSubscriber`.
 *
 * ```ts
 * cover: () => attachment({ folder: 'posts/covers', disk: 'public' }).nullable()
 * ```
 */
export const attachment = (options: AttachmentOptions = {}) =>
  p.type(new AttachmentDatabaseType(options)).$type<Asset | IAsset>();
