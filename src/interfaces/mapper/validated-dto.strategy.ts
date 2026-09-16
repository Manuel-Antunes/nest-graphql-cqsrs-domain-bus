import { classes } from "@automapper/classes";
import type {
  Dictionary,
  Mapping,
  MappingStrategyInitializer,
  MetadataIdentifier,
} from "@automapper/core";

/**
 * A estratégia `classes`, com **uma** adição: toda origem que é um `ValidatedDto` chega ao mapeamento
 * já materializada.
 *
 * ## O problema que isto resolve
 * O @nestjs/graphql entrega os `@Args` como **objeto cru** — no schema-first nem existe classe de
 * `@InputType` para ele instanciar. Então o que um pipe recebe em `createPost` não é um
 * `CreatePostInput`: é `{ title: "…", content: "…" }`, texto puro.
 *
 * A diferença é grave e silenciosa: o mapeamento é compilado assumindo que `CreatePostInput.title` é
 * um `PostTitle`, então o conversor tenta desembrulhar o que já está cru e o campo chega `undefined`
 * do outro lado — sem erro, sem log, com o command inteiro montado em volta de um buraco.
 *
 * ## Por que na estratégia, e não num pipe antes de cada mapeamento
 * Porque `preMap` roda em **todos** os caminhos, inclusive nos mapeamentos aninhados, onde não há
 * pipe para pendurar. Um pipe por resolver resolveria o `updatePost` de hoje e deixaria o próximo
 * input em aberto — e a forma de descobrir seria um campo vazio em produção.
 *
 * Não valida: `new CreatePostInput(...)` monta os value objects sem lançar, e quem recusa um título
 * vazio continua sendo o agregado.
 */
export function validatedDtoClasses(): MappingStrategyInitializer<MetadataIdentifier> {
  /** Um DTO gerado pelo mixin — o `__schema` é a marca que ele deixa na classe. */
  function isValidatedDto(
    identifier: MetadataIdentifier,
  ): identifier is new (data?: unknown) => unknown {
    return typeof identifier === "function" && "__schema" in identifier;
  }
  
  function materializeValidatedDto<
    TSource extends Dictionary<TSource>,
    TDestination extends Dictionary<TDestination>,
  >(source: TSource, mapping: Mapping<TSource, TDestination>): TSource {
    // `mapping[0]` é o par de identificadores do mapeamento: [origem, destino].
    const [sourceIdentifier] = mapping[0];
    return isValidatedDto(sourceIdentifier) &&
      !(source instanceof sourceIdentifier)
      ? (new sourceIdentifier(source) as TSource)
      : source;
  }

  return classes({ preMap: materializeValidatedDto });
}
