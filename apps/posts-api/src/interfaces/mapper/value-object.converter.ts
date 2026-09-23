import type { MappingConfiguration } from '@automapper/core';
import type { ScalarValueObject } from '@nestposts/validated-dto/mixins';
import { typeConverter } from '@automapper/core';

type RawConstructor =
  StringConstructor | NumberConstructor | BooleanConstructor | DateConstructor;

type RawValue<R extends RawConstructor> = R extends DateConstructor
  ? Date
  : ReturnType<
      Extract<R, StringConstructor | NumberConstructor | BooleanConstructor>
    >;

type ScalarValueObjectClass<Raw> = new (raw: any) => ScalarValueObject<Raw>;

export function valueObjectConverter<R extends RawConstructor>(
  ValueObject: ScalarValueObjectClass<RawValue<R>>,
  Raw: R,
): MappingConfiguration {
  const unwrap = typeConverter(ValueObject, Raw, ((
    vo: ScalarValueObject<RawValue<R>>,
  ) => (vo == null ? vo : vo.value)) as never);
  const wrap = typeConverter(Raw, ValueObject, ((raw: RawValue<R>) =>
    raw == null ? raw : new ValueObject(raw)) as never);

  return (mapping) => {
    unwrap(mapping);
    wrap(mapping);
  };
}
