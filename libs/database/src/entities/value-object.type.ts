import { Type } from '@mikro-orm/core';
import { rawScalarValue } from '@nestposts/validated-dto/mixins';

export interface ValueObjectTypeOptions {
  columnType: string;
  compareAs?: string;
}

interface ScalarValueObjectClass<Instance> {
  readonly name: string;
  wrap(parsed: any): Instance;
  parse(value: unknown): Instance;
}

export function valueObjectType<Instance>(
  valueObject: ScalarValueObjectClass<Instance>,
  options: ValueObjectTypeOptions,
): new () => Type<Instance | undefined, string | undefined> {
  const { columnType, compareAs = 'string' } = options;

  class ValueObjectType extends Type<Instance | undefined, string | undefined> {
    override convertToDatabaseValue(value: unknown): any {
      return value == null ? value : (rawScalarValue(value) as string);
    }

    override convertToJSValue(value: unknown): any {
      if (value == null) {
        return value;
      }
      return value instanceof (valueObject as any) ? value : valueObject.wrap(value);
    }

    override compareAsType(): string {
      return compareAs;
    }

    override getColumnType(): string {
      return columnType;
    }

    override toJSON(value: unknown): any {
      return value == null ? value : (rawScalarValue(value) as string);
    }

    override fromJSON(value: unknown): any {
      return value == null ? value : valueObject.parse(value);
    }
  }

  Object.defineProperty(ValueObjectType, 'name', {
    value: `${valueObject.name}Type`,
    writable: false,
    enumerable: false,
    configurable: true,
  });

  return ValueObjectType as any;
}
