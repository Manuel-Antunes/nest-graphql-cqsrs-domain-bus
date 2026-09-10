import { z } from 'zod';

/**
 * O que um schema *embutido* aponta: a classe de value object que o produz.
 *
 * `kind` diz como o mixin de objeto precisa tratar o campo na hora de serializar:
 *
 * - `scalar` — o value object colapsa para um valor cru (`@Transform`): `PostId` vira `"uuid"` no
 *   JSON, e não `{ value: "uuid" }`. É o `@Embedded` de um `@Embeddable record` de uma coluna só.
 * - `object` — o value object é um objeto de verdade e o class-transformer sabe entrá-lo (`@Type`),
 *   como qualquer DTO aninhado.
 */
export interface EmbeddedBinding {
  kind: 'scalar' | 'object';
  /** A classe concreta — a que o `field()` foi chamado, e não a base gerada pelo mixin. */
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
 * O registro que liga **o schema de um campo** à classe de value object que ele materializa.
 *
 * Ele é populado por `VO.field()` (e por `ValidatedDto.embed(VO)`, que é o mesmo), nunca à mão: o
 * `field()` é um método estático, então o `this` dele já é a classe **concreta** — se você escreveu
 * `class PostId extends ValidatedDto.Scalar(PostIdSchema) {}`, é `PostId` que fica registrada, e não
 * a base anônima que o mixin gerou. É por isso que não existe um decorator de "registre-me": a
 * chamada que embute o campo é a mesma que diz qual classe ele produz.
 *
 * Mora num registry do Zod (e não num `WeakMap` avulso) pelo mesmo motivo do `DECORATOR_REGISTRY`:
 * é o mecanismo que o Zod 4 oferece para pendurar metadado num schema.
 */
export const EMBEDDED_REGISTRY: EMBEDDED_REGISTRY_TYPE = createEmbeddedRegistry();

/** Lê o vínculo de um schema, tolerando `undefined` e schemas de outra origem. */
export function getEmbedded(
  schema: z.ZodType | undefined,
  registry: EMBEDDED_REGISTRY_TYPE = EMBEDDED_REGISTRY,
): EmbeddedBinding | undefined {
  if (!schema) {
    return undefined;
  }
  // O `get` de um registry do Zod devolve o metadado remapeado pelo `$replace` dele, que achata
  // tipos-função; o cast devolve o vínculo à forma em que ele foi guardado.
  const binding = registry.get(schema) as EmbeddedBinding | undefined;
  if (binding) {
    return binding;
  }
  // Registries isolados não substituem o global: um DTO pode misturar campos dos dois.
  return registry === EMBEDDED_REGISTRY
    ? undefined
    : (EMBEDDED_REGISTRY.get(schema) as EmbeddedBinding | undefined);
}
