import { classes } from '@automapper/classes';
import type {
  Dictionary,
  Mapping,
  MappingStrategyInitializer,
  MetadataIdentifier,
} from '@automapper/core';

export function validatedDtoClasses(): MappingStrategyInitializer<MetadataIdentifier> {
  function isValidatedDto(
    identifier: MetadataIdentifier,
  ): identifier is new (
    data?: unknown,
  ) => unknown {
    return typeof identifier === 'function' && '__schema' in identifier;
  }

  function materializeValidatedDto<
    TSource extends Dictionary<TSource>,
    TDestination extends Dictionary<TDestination>,
  >(source: TSource, mapping: Mapping<TSource, TDestination>): TSource {
    const [sourceIdentifier] = mapping[0];
    return isValidatedDto(sourceIdentifier) &&
      !(source instanceof sourceIdentifier)
      ? (new sourceIdentifier(source) as TSource)
      : source;
  }

  return classes({ preMap: materializeValidatedDto });
}
