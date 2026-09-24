import type {
  AttachmentOptions,
  AttachmentResolverContext,
  Resolvable,
  ResolvedAttachmentOptions,
} from '../schemas/attachment-options.schema';
import { AssetContextRegistry } from './asset-context-registry';

function resolveValue<TValue, TEntity>(
  option: Resolvable<TValue, TEntity>,
  entity: TEntity | undefined,
  context: AttachmentResolverContext,
): TValue {
  return typeof option === 'function'
    ? (option as (e: TEntity | undefined, c: typeof context) => TValue)(
        entity,
        context,
      )
    : option;
}

/**
 * Collapses declared options into plain values, evaluating every strategy against the owning entity
 * and the ambient {@link AssetContextRegistry}.
 *
 * Call it once per attach or load: a strategy that reads the clock must produce one key, and an
 * `Asset` never holds a function it could re-evaluate after the object was written.
 */
export function resolveAttachmentOptions<TEntity>(
  options: AttachmentOptions<TEntity> | undefined,
  where: { entity?: TEntity; path?: readonly string[] } = {},
): ResolvedAttachmentOptions {
  if (!options) return {};

  const context: AttachmentResolverContext = {
    path: where.path ?? [],
    ctx: AssetContextRegistry.read(),
  };

  return {
    folder: resolveValue(options.folder, where.entity, context),
    disk: resolveValue(options.disk, where.entity, context),
    preComputeUrl: resolveValue(options.preComputeUrl, where.entity, context),
    keepSource: resolveValue(options.keepSource, where.entity, context),
  };
}
