import { randomUUID } from 'node:crypto';
import { posix } from 'node:path';

import type { Asset } from '../asset/asset';
import { AttachmentContextRegistry } from '../context/attachment-context-registry';
import type {
  AttachmentDefaults,
  AttachmentOptions,
  AttachmentOwner,
  AttachmentStrategyContext,
  Resolvable,
  ResolvedAttachmentOptions,
} from './attachment-options';

/** Where the variants of an attachment are stored, relative to the attachment. */
export interface VariantLayout {
  /** A folder every variant is stored under, instead of beside its attachment. */
  basePath?: string;
  /** Leave the attachment's folder out of the variants' folder. */
  ignoreFolder?: boolean;
}

/**
 * Turns declared options into the key a file is stored under: `@jrmc/adonis-attachment`'s
 * `makeFolder` and `makeName`, plus the strategies this library adds.
 */
export class AttachmentPath {
  /** Evaluates every strategy of `declared` against `owner`, over the module's `defaults`. */
  static async resolve<TEntity>(
    declared: AttachmentOptions<TEntity> | undefined,
    defaults: AttachmentDefaults,
    owner: AttachmentOwner<TEntity>,
  ): Promise<ResolvedAttachmentOptions> {
    const context: AttachmentStrategyContext = {
      path: owner.path,
      originalName: owner.originalName,
      ctx: AttachmentContextRegistry.read(),
    };
    const value = <T>(option: Resolvable<T, TEntity> | undefined) =>
      AttachmentPath.evaluate(option, owner.entity, context);

    return {
      disk: (await value(declared?.disk)) ?? defaults.disk,
      folder: (await value(declared?.folder)) ?? defaults.folder,
      rename: (await value(declared?.rename)) ?? defaults.rename,
      preComputeUrl:
        (await value(declared?.preComputeUrl)) ?? defaults.preComputeUrl,
      meta: (await value(declared?.meta)) ?? defaults.meta,
      keepSource: (await value(declared?.keepSource)) ?? defaults.keepSource,
      variants: declared?.variants ?? [],
    };
  }

  /** The key `asset` is stored under, in the folder and by the name `options` give it. */
  static of(
    asset: Asset,
    options: ResolvedAttachmentOptions,
    entity?: unknown,
  ): string {
    const folder = options.folder
      ? AttachmentPath.interpolate(options.folder, entity)
      : undefined;
    const name = AttachmentPath.nameOf(asset, options.rename, entity);
    return folder ? posix.join(folder, name) : name;
  }

  /**
   * The folder an attachment's variants are stored in: `<folder>/variants/<name>` by default,
   * `<basePath>/<folder>/<name>` with a base path, and without `<folder>` when it is ignored.
   */
  static variantFolder(asset: Asset, layout: VariantLayout = {}): string {
    const folder = layout.ignoreFolder ? undefined : asset.folder;
    const segments = layout.basePath
      ? [layout.basePath, folder, asset.name]
      : layout.ignoreFolder
        ? [asset.name]
        : [folder, 'variants', asset.name];
    return posix.join(
      ...segments.filter((segment): segment is string => !!segment),
    );
  }

  /** Replaces every `:name` segment of `template` by the entity's `name`, slugged. */
  static interpolate(template: string, entity: unknown): string {
    return template.replace(/:(\w+)/g, (segment, name: string) => {
      const text = AttachmentPath.textOf(
        (entity as Record<string, unknown> | undefined)?.[name],
      );
      return text === undefined ? segment : AttachmentPath.slug(text);
    });
  }

  static slug(value: string): string {
    return value
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  private static nameOf(
    asset: Asset,
    rename: boolean | string,
    entity: unknown,
  ): string {
    if (rename === true) {
      return `${randomUUID()}.${asset.extname}`;
    }
    if (rename === false) {
      return posix.basename(asset.originalName);
    }
    return AttachmentPath.interpolate(rename, entity);
  }

  private static textOf(value: unknown): string | undefined {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'bigint') {
      return String(value);
    }
    if (value && typeof value === 'object' && 'value' in value) {
      return AttachmentPath.textOf(value.value);
    }
    return undefined;
  }

  private static async evaluate<T, TEntity>(
    option: Resolvable<T, TEntity> | undefined,
    entity: TEntity | undefined,
    context: AttachmentStrategyContext,
  ): Promise<T | undefined> {
    return typeof option === 'function'
      ? (
          option as (
            entity: TEntity | undefined,
            context: AttachmentStrategyContext,
          ) => T | Promise<T>
        )(entity, context)
      : option;
  }
}
