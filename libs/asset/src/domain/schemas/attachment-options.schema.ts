import { z } from 'zod';

import type { AssetContextData } from '../context/asset-context-registry';
import type { Disks } from './disks.schema';
import { DisksSchema } from './disks.schema';

/**
 * Attachment options once every strategy has been resolved: plain values only, which is the only
 * shape that survives serialisation.
 */
export const AttachmentOptionsSchema = z.object({
  folder: z.string().optional(),
  disk: DisksSchema.optional(),
  preComputeUrl: z.boolean().optional(),
  /**
   * Copy the staged object into its owned key instead of moving it. Set it when the source is a
   * durable location someone else still reads; leave it off for a throwaway upload key.
   */
  keepSource: z.boolean().optional(),
});

export type ResolvedAttachmentOptions = z.infer<typeof AttachmentOptionsSchema>;

/** What a strategy receives besides the owning entity. */
export interface AttachmentResolverContext {
  /** The property path on the entity, e.g. `['documents', 'identification', 'asset']`. */
  path: readonly string[];
  /** The ambient context: globals overlaid with the current scope. */
  ctx: AssetContextData;
}

/**
 * A declared option: a plain value, or a strategy evaluated once per attach or load.
 *
 * ```ts
 * attachment({ folder: 'uploads/avatars' })
 * attachment({ folder: () => new Date().toISOString().slice(0, 7) })
 * attachment({ folder: (post, { ctx }) => `${ctx.tenantId}/posts/${post?.id}` })
 * ```
 */
export type Resolvable<TValue, TEntity = any> =
  | TValue
  | ((
      entity: TEntity | undefined,
      context: AttachmentResolverContext,
    ) => TValue);

/** The options `attachment()` accepts. */
export interface AttachmentOptions<TEntity = any> {
  folder?: Resolvable<string | undefined, TEntity>;
  disk?: Resolvable<Disks | undefined, TEntity>;
  preComputeUrl?: Resolvable<boolean | undefined, TEntity>;
  keepSource?: Resolvable<boolean | undefined, TEntity>;
}
