import type { AttachmentContextData } from '../context/attachment-context-registry';

/** What a strategy receives besides the owning entity. */
export interface AttachmentStrategyContext {
  /** The property, as its path on the entity: `['documents', 'identification', 'file']`. */
  path: readonly string[];
  /** The name the file had where it came from. */
  originalName?: string;
  /** The ambient context: globals overlaid with the current scope. */
  ctx: AttachmentContextData;
}

/**
 * An option given as a value, or as a strategy evaluated once per attachment stored — against the
 * entity that holds it, which `@jrmc/adonis-attachment` calls the record.
 *
 * ```ts
 * attachment({ folder: 'uploads/avatars' })
 * attachment({ folder: 'users/:slug/avatars' })
 * attachment({ folder: () => new Date().toISOString().slice(0, 7) })
 * attachment({ folder: (user) => `users/${user?.id}` })
 * attachment({ folder: (_user, { ctx }) => `tenants/${ctx.tenantId}/avatars` })
 * attachment({ rename: async (_user, { originalName }) => slugify(originalName) })
 * ```
 */
export type Resolvable<TValue, TEntity = any> =
  | TValue
  | ((
      entity: TEntity | undefined,
      context: AttachmentStrategyContext,
    ) => TValue | Promise<TValue>);

/** The options of an `attachment()` or `attachments()` column. Unset ones fall back to the module's. */
export interface AttachmentOptions<TEntity = any> {
  /** The disk the file is stored on. Defaults to the drive's default disk. */
  disk?: Resolvable<string | undefined, TEntity>;

  /**
   * The folder the file is stored in. `:name` segments are replaced by the entity's `name`, slugged,
   * when it is a string, a number, or a value object holding one in `value`.
   */
  folder?: Resolvable<string | undefined, TEntity>;

  /**
   * How the stored file is named: `true` a random UUID with the file's extension, `false` its
   * original name, a string that name — with `:name` segments replaced as in `folder`.
   */
  rename?: Resolvable<boolean | string | undefined, TEntity>;

  /** Resolve the URLs of the file and its variants when the entity is loaded or saved. */
  preComputeUrl?: Resolvable<boolean | undefined, TEntity>;

  /** Read the file's metadata — dimensions, EXIF, duration, pages — when it is stored. */
  meta?: Resolvable<boolean | undefined, TEntity>;

  /** Leave the object an `Attachment.fromDisk` was made of where it is, once copied into place. */
  keepSource?: Resolvable<boolean | undefined, TEntity>;

  /** The converters to make variants with once the file is stored, by the name they are registered under. */
  variants?: readonly string[];
}

/** The options once the module's defaults are applied and every strategy evaluated. */
export interface ResolvedAttachmentOptions {
  disk?: string;
  folder?: string;
  rename: boolean | string;
  preComputeUrl: boolean;
  meta: boolean;
  keepSource: boolean;
  variants: readonly string[];
}

/** The module-wide values an option falls back to. */
export type AttachmentDefaults = Omit<ResolvedAttachmentOptions, 'variants'>;

/** Where an option is evaluated: the entity holding the file, and the property it is held by. */
export interface AttachmentOwner<TEntity = any> {
  entity?: TEntity;
  path: readonly string[];
  originalName?: string;
}
