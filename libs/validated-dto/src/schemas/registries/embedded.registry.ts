import { z } from 'zod';

/**
 * What an *embedded* schema points at: the value object class it produces.
 *
 * `kind` tells the object mixin how to treat the field when serializing:
 *
 * - `scalar` — the value object collapses to a raw value (`@Transform`): `PostId` becomes `"uuid"` in
 *   JSON, not `{ value: "uuid" }`. It is the `@Embedded` of a single-column `@Embeddable record`.
 * - `object` — the value object is a real object and class-transformer knows how to descend into it
 *   (`@Type`), like any nested DTO.
 */
export interface EmbeddedBinding {
  kind: 'scalar' | 'object';
  /** The concrete class — the one `field()` was called on, not the base the mixin generated. */
  target: abstract new (...args: any[]) => any;
}

export type EMBEDDED_REGISTRY_TYPE = z.core.$ZodRegistry<
  EmbeddedBinding,
  z.core.$ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>
>;

export function createEmbeddedRegistry(): EMBEDDED_REGISTRY_TYPE {
  return z.registry<EmbeddedBinding>();
}

/**
 * The registry binding **a field's schema** to the value object class it materializes.
 *
 * It is populated by `VO.field()` (and by `ValidatedDto.embed(VO)`, which is the same thing), never by
 * hand: `field()` is a static method, so its `this` is already the **concrete** class — if you wrote
 * `class PostId extends ValidatedDto.Scalar(PostIdSchema) {}`, it is `PostId` that gets registered, not
 * the anonymous base the mixin generated. That is why there is no "register me" decorator: the call
 * that embeds the field is the same one that says which class it produces.
 *
 * It lives in a Zod registry (rather than a loose `WeakMap`) for the same reason as
 * `DECORATOR_REGISTRY`: it is the mechanism Zod 4 offers for hanging metadata off a schema.
 */
export const EMBEDDED_REGISTRY: EMBEDDED_REGISTRY_TYPE =
  createEmbeddedRegistry();

/** Reads a schema's binding, tolerating `undefined` and schemas from another origin. */
export function getEmbedded(
  schema: z.ZodType | undefined,
  registry: EMBEDDED_REGISTRY_TYPE = EMBEDDED_REGISTRY,
): EmbeddedBinding | undefined {
  if (!schema) {
    return undefined;
  }
  const binding = registry.get(schema) as EmbeddedBinding | undefined;
  if (binding) {
    return binding;
  }
  return registry === EMBEDDED_REGISTRY
    ? undefined
    : (EMBEDDED_REGISTRY.get(schema) as EmbeddedBinding | undefined);
}
