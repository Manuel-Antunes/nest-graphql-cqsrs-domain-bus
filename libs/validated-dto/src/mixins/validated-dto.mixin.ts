import 'reflect-metadata';

import { type ValidationArguments, type ValidatorConstraintInterface, Validate, ValidatorConstraint } from 'class-validator';
import {
  Expose,
  instanceToPlain,
  Transform,
  TransformationType,
  Type,
} from 'class-transformer';
import { z } from 'zod';

import { type DECORATOR_REGISTRY_TYPE, DECORATOR_REGISTRY as GLOBAL_DECORATOR_REGISTRY } from '../schemas/registries/decorators.registry';
import { type EmbeddedBinding, type EMBEDDED_REGISTRY_TYPE, EMBEDDED_REGISTRY, getEmbedded } from '../schemas/registries/embedded.registry';
import { type ScalarFieldOptions, type ScalarValueObjectStatic, type ValidatedScalarOptions, rawScalarValue, ValidatedScalar } from './validated-scalar.mixin';
/**
 * Class decorator that copies metadata from the ValidatedDto parent class to the extending class.
 * This is required when using ValidatedDto with frameworks like GraphQL that inspect the final class
 * for field metadata.
 *
 * @example
 * ```typescript
 * @InheritValidatedMetadata()
 * export class WellGqlCreateDto extends ValidatedDto(schema, { DECORATOR_REGISTRY: registry }) {}
 * ```
 */
export function InheritValidatedMetadata(): ClassDecorator {
  return function (target: any) {
    const parentClass = Object.getPrototypeOf(target);
    if (
      parentClass &&
      typeof parentClass.__copyMetadataToChild === 'function'
    ) {
      parentClass.__copyMetadataToChild(target);
    }
  };
}

@ValidatorConstraint({ name: 'ZodFieldValidator', async: false })
export class ZodFieldValidator implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments) {
    const [schema] = args.constraints;
    const result = schema.safeParse(value);
    return result.success;
  }

  defaultMessage(args: ValidationArguments) {
    const [schema] = args.constraints;
    const result = schema.safeParse(args.value);

    if (schema.description) {
      return `${schema.description} is invalid`;
    }

    if (!result.success) {
      return result.error.issues[0].message;
    }
    return 'Validation failed';
  }
}

/**
 * Extract decorators from a schema's registry data
 * Uses Zod v4's registry system via DECORATOR_REGISTRY
 */
function getRegistryDecorators(
  schema: z.ZodType,
  DECORATOR_REGISTRY: DECORATOR_REGISTRY_TYPE = GLOBAL_DECORATOR_REGISTRY,
): Array<PropertyDecorator | ClassDecorator> {
  try {
    const registryData = DECORATOR_REGISTRY.get(schema);
    const decorators: Array<PropertyDecorator | ClassDecorator> = [];

    if (registryData && Array.isArray(registryData.decorators)) {
      decorators.push(
        ...(registryData.decorators as Array<
          PropertyDecorator | ClassDecorator
        >),
      );
    }

    if (DECORATOR_REGISTRY !== GLOBAL_DECORATOR_REGISTRY) {
      const globalDecorators = GLOBAL_DECORATOR_REGISTRY.get(schema);
      if (globalDecorators && Array.isArray(globalDecorators.decorators)) {
        globalDecorators.decorators.forEach((d) => {
          const decorator = d as PropertyDecorator | ClassDecorator;
          if (!decorators.includes(decorator)) {
            decorators.push(decorator);
          }
        });
      }
    }

    return decorators;
  } catch {
    return [];
  }
}

/**
 * Unwrap Zod schema wrappers (Optional, Nullable, Default, Transform)
 */
function unwrapSchema(schema: z.ZodType): z.ZodType {
  let current = schema;
  while (
    current instanceof z.ZodOptional ||
    current instanceof z.ZodNullable ||
    current instanceof z.ZodDefault ||
    current instanceof z.ZodTransform
  ) {
    if (current instanceof z.ZodTransform) {
      current = (current._def as any).out as z.ZodType;
    } else if (current instanceof z.ZodDefault) {
      current = current._def.innerType as z.ZodType;
    } else {
      current = current.unwrap() as z.ZodType;
    }
  }
  return current;
}

/**
 * Get TypeScript design type for Reflect metadata
 */
function getDesignType(schema: z.ZodType<any>): any {
  const unwrapped = unwrapSchema(schema);

  if (unwrapped instanceof z.ZodUnion) {
    const firstOption = unwrapped.options[0];
    return firstOption ? getDesignType(firstOption as z.ZodType) : Object;
  }

  if (unwrapped instanceof z.ZodDiscriminatedUnion) {
    const firstOption = Array.from(unwrapped.options.values())[0];
    return firstOption ? getDesignType(firstOption as z.ZodType<any>) : Object;
  }

  if (unwrapped instanceof z.ZodNumber) return Number;
  if (unwrapped instanceof z.ZodString) return String;
  if (unwrapped instanceof z.ZodBoolean) return Boolean;
  if (unwrapped instanceof z.ZodDate) return Date;
  if (unwrapped instanceof z.ZodArray) return Array;
  return Object;
}

/**
 * What an embedded field holds: the value object class, and whether it arrives inside a list.
 *
 * `z.array(PostId.field())` embeds the same value object item by item — hence `isArray`.
 */
interface EmbeddedField {
  binding: EmbeddedBinding;
  isArray: boolean;
}

/** Works out whether a field is a `VO.field()` — directly, or inside an array. */
function embeddedFieldOf(
  innerType: z.ZodType,
  registry?: Parameters<typeof getEmbedded>[1],
): EmbeddedField | undefined {
  const direct = getEmbedded(innerType, registry);
  if (direct) {
    return { binding: direct, isArray: false };
  }
  if (innerType instanceof z.ZodArray) {
    const element = getEmbedded(innerType.element as z.ZodType, registry);
    if (element) {
      return { binding: element, isArray: true };
    }
  }
  return undefined;
}

/** Raw value (or an already-built one) → the value object instance. Nulls pass through untouched. */
function materializeEmbedded(field: EmbeddedField, value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (field.isArray) {
    return Array.isArray(value)
      ? value.map((item) => materializeEmbedded({ ...field, isArray: false }, item))
      : value;
  }
  const Target = field.binding.target as new (input: unknown) => unknown;
  return value instanceof Target ? value : new Target(value);
}

/**
 * The value object instance → what goes into JSON.
 *
 * A scalar **collapses** to the raw value: a `PostId` comes out as `"uuid"`, not as `{ value: … }`.
 * That is the difference between a single-column `@Embeddable` and a multi-column one — the latter
 * stays an object, and class-transformer itself is what flattens it.
 */
function plainifyEmbedded(
  field: EmbeddedField,
  value: unknown,
  options: any,
): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (field.isArray) {
    return Array.isArray(value)
      ? value.map((item) => plainifyEmbedded({ ...field, isArray: false }, item, options))
      : value;
  }
  return field.binding.kind === 'scalar'
    ? rawScalarValue(value)
    : instanceToPlain(value, options);
}

/**
 * Internal helper to create a validated DTO class for a ZodObject schema.
 * This is extracted to support both direct usage and union composition.
 */
const createObjectClass = <T extends z.ZodRawShape>(
  schema: z.ZodObject<T>,
  options: {
    exposeAll: boolean;
    maxObjectDepth: number;
    DECORATOR_REGISTRY?: DECORATOR_REGISTRY_TYPE;
    EMBEDDED_REGISTRY?: EMBEDDED_REGISTRY_TYPE;
  },
) => {
  const { exposeAll, maxObjectDepth } = options;
  const shape = schema.shape;

  const unionClassCache = new Map<string, any>();

  const embeddedFields = new Map<string, EmbeddedField>();

  for (const key of Object.keys(shape)) {
    const innerType = unwrapSchema(shape[key] as z.ZodType);

    const embedded = embeddedFieldOf(innerType, options.EMBEDDED_REGISTRY);
    if (embedded) {
      embeddedFields.set(key, embedded);
    }

    if (
      innerType instanceof z.ZodUnion ||
      innerType instanceof z.ZodDiscriminatedUnion
    ) {
      const UnionClass = ValidatedDto(innerType, {
        exposeAll,
        maxObjectDepth: maxObjectDepth - 1,
        DECORATOR_REGISTRY: options.DECORATOR_REGISTRY,
        EMBEDDED_REGISTRY: options.EMBEDDED_REGISTRY,
      });
      unionClassCache.set(key, UnionClass);
    }
  }

  class GeneratedDto {
    constructor(data?: Partial<z.input<typeof schema>>) {
      if (data) {
        Object.assign(this, data);

        for (const key of Object.keys(shape)) {
          if ((data as any)[key] !== undefined && unionClassCache.has(key)) {
            const value = (data as any)[key];
            if (
              value &&
              typeof value === 'object' &&
              value.constructor === Object
            ) {
              const UnionClass = unionClassCache.get(key);
              (this as any)[key] = new UnionClass(value);
            }
          }
        }
      }

      for (const key of Object.keys(shape)) {
        if ((this as any)[key] === undefined) {
          const fieldSchema = shape[key] as z.ZodType;
          const result = fieldSchema.safeParse(undefined);
          if (result.success && result.data !== undefined) {
            (this as any)[key] = result.data;
          }
        }
      }

      for (const [key, embedded] of embeddedFields) {
        const current = (this as any)[key];
        if (current !== undefined) {
          (this as any)[key] = materializeEmbedded(embedded, current);
        }
      }
    }
  }

  Object.defineProperty(GeneratedDto.prototype, 'constructor', {
    value: GeneratedDto,
    writable: true,
    enumerable: false,
    configurable: true,
  });

  for (const key of Object.keys(shape)) {
    const fieldSchema = shape[key] as z.ZodType;
    const innerType = unwrapSchema(fieldSchema);
    const embedded = embeddedFields.get(key);

    if (exposeAll) {
      Expose()(GeneratedDto.prototype, key);
    }

    Validate(ZodFieldValidator, [fieldSchema])(GeneratedDto.prototype, key);

    if (embedded && embedded.binding.kind === 'object') {
      Type(() => embedded.binding.target as any)(GeneratedDto.prototype, key);
    }
    else if (innerType instanceof z.ZodObject && maxObjectDepth > 0) {
      const NestedClass = createObjectClass(innerType, {
        exposeAll,
        maxObjectDepth: maxObjectDepth - 1,
        DECORATOR_REGISTRY: options.DECORATOR_REGISTRY,
        EMBEDDED_REGISTRY: options.EMBEDDED_REGISTRY,
      });
      Type(() => NestedClass)(GeneratedDto.prototype, key);
    }
    else if (
      innerType instanceof z.ZodArray &&
      innerType.element instanceof z.ZodObject
    ) {
      const NestedClass = createObjectClass(innerType.element, {
        exposeAll,
        maxObjectDepth: maxObjectDepth - 1,
        DECORATOR_REGISTRY: options.DECORATOR_REGISTRY,
        EMBEDDED_REGISTRY: options.EMBEDDED_REGISTRY,
      });
      Type(() => NestedClass)(GeneratedDto.prototype, key);
    }
    else if (innerType instanceof z.ZodUnion) {
      const UnionClass = unionClassCache.get(key)!;
      Type(() => UnionClass)(GeneratedDto.prototype, key);
    }
    else if (innerType instanceof z.ZodDiscriminatedUnion) {
      const UnionClass = unionClassCache.get(key)!;
      Type(() => UnionClass)(GeneratedDto.prototype, key);
    }
    else if (
      innerType instanceof z.ZodArray &&
      (innerType.element instanceof z.ZodUnion ||
        innerType.element instanceof z.ZodDiscriminatedUnion)
    ) {
      const UnionClass = ValidatedDto(innerType.element, {
        exposeAll,
        maxObjectDepth: maxObjectDepth - 1,
      });
      Type(() => UnionClass)(GeneratedDto.prototype, key);
    }

    Transform(({ value, obj, type, options }) => {
      if (value === undefined && !(key in obj)) {
        const result = fieldSchema.safeParse(undefined);
        return result.success
          ? embedded
            ? materializeEmbedded(embedded, result.data)
            : result.data
          : undefined;
      }

      if (embedded) {
        return type === TransformationType.CLASS_TO_PLAIN
          ? plainifyEmbedded(embedded, value, options)
          : materializeEmbedded(embedded, value);
      }

      if (
        innerType instanceof z.ZodUnion ||
        innerType instanceof z.ZodDiscriminatedUnion
      ) {
        const options =
          innerType instanceof z.ZodUnion
            ? ((innerType._def as any).options as z.ZodTypeAny[])
            : Array.from(
                (
                  innerType as z.ZodDiscriminatedUnion<any, any>
                ).options.values(),
              );

        const allPrimitives = options.every(
          (opt) => !(opt instanceof z.ZodObject),
        );

        if (allPrimitives) {
          const result = fieldSchema.safeParse(value);
          return result.success ? result.data : value;
        }

        if (
          value &&
          typeof value === 'object' &&
          value.constructor !== Object &&
          value.constructor !== Array
        ) {
          return value;
        }

        const UnionClass =
          unionClassCache.get(key) ||
          ValidatedDto(innerType, {
            exposeAll,
            maxObjectDepth: maxObjectDepth - 1,
          });
        return new UnionClass(value);
      }

      const result = fieldSchema.safeParse(value);
      return result.success ? result.data : value;
    })(GeneratedDto.prototype, key);

    const designType = embedded
      ? embedded.isArray
        ? Array
        : (embedded.binding.target as any)
      : getDesignType(fieldSchema);
    if (designType) {
      Reflect.defineMetadata(
        'design:type',
        designType,
        GeneratedDto.prototype,
        key,
      );
    }
  }
  const classDecorators = getRegistryDecorators(
    schema,
    options.DECORATOR_REGISTRY,
  );
  classDecorators.forEach((decorator) => {
    if (typeof decorator === 'function') {
      (decorator as ClassDecorator)(GeneratedDto);
    }
  });

  const OriginalClass = GeneratedDto;
  (OriginalClass as any).__copyMetadataToChild = function (childClass: any) {
    const childProto = childClass.prototype;
    const parentProto = OriginalClass.prototype;

    for (const key of Object.keys(shape)) {
      const designType = Reflect.getMetadata('design:type', parentProto, key);
      if (designType) {
        Reflect.defineMetadata('design:type', designType, childProto, key);
      }

      const metadataKeys = Reflect.getMetadataKeys(parentProto, key);
      metadataKeys.forEach((metadataKey) => {
        const metadata = Reflect.getMetadata(metadataKey, parentProto, key);
        Reflect.defineMetadata(metadataKey, metadata, childProto, key);
      });

      const fieldSchema = shape[key] as z.ZodType;
      const decorators = getRegistryDecorators(
        fieldSchema,
        options.DECORATOR_REGISTRY,
      );
      decorators.forEach((decorator) => {
        if (typeof decorator === 'function') {
          (decorator as PropertyDecorator)(childProto, key);
        }
      });
    }

    const schemaDecorators = getRegistryDecorators(
      schema,
      options.DECORATOR_REGISTRY,
    );
    schemaDecorators.forEach((decorator) => {
      if (typeof decorator === 'function') {
        (decorator as ClassDecorator)(childClass);
      }
    });

    const classMetadataKeys = Reflect.getMetadataKeys(OriginalClass);
    classMetadataKeys.forEach((metadataKey) => {
      const metadata = Reflect.getMetadata(metadataKey, OriginalClass);
      Reflect.defineMetadata(metadataKey, metadata, childClass);
    });
  };

  (GeneratedDto as any).__schema = schema;
  (GeneratedDto as any).__registry = options.DECORATOR_REGISTRY;

  return GeneratedDto as unknown as new (
    data?: Partial<z.input<typeof schema>>,
  ) => z.infer<typeof schema>;
};

export interface ValidatedDtoOptions {
  exposeAll?: boolean;
  maxObjectDepth?: number;
  DECORATOR_REGISTRY?: DECORATOR_REGISTRY_TYPE;
  /** Where to look for embedded value objects. The global one covers the normal case. */
  EMBEDDED_REGISTRY?: EMBEDDED_REGISTRY_TYPE;
}

/**
 * An `Omit` that **distributes** over a union, instead of flattening it down to the common keys.
 *
 * The normal `Omit` is `Pick<T, Exclude<keyof T, K>>`, and `keyof (A | B)` is only the intersection of
 * the keys — so a discriminated-union schema used to lose, in the **constructor**'s type, everything
 * that was not common to every variant. By distributing, each variant is cut on its own.
 *
 * It applies to input only: the **instance** type stays flattened on purpose, because a union cannot
 * serve as a base class (`class X extends ValidatedDto(union) {}` needs an object type).
 */
type DistributiveOmit<T, K extends PropertyKey> = T extends any ? Omit<T, K> : never;

/**
 * ValidatedDto factory that supports:
 * - ZodObject schemas (original behavior)
 * - ZodDiscriminatedUnion schemas (optimized)
 * - ZodUnion schemas (fallback)
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export function ValidatedDto<Schema extends z.ZodType<any>, Extras = {}>(
  schema: Schema,
  options?: ValidatedDtoOptions,
): (new (
  data?: DistributiveOmit<z.input<Schema>, keyof Extras> & Extras,
) => Omit<z.infer<Schema>, keyof Extras> & Extras) & {
  __schema: Schema;
  __constructorProps: DistributiveOmit<z.input<Schema>, keyof Extras> & Extras;
} {
  const {
    exposeAll = true,
    maxObjectDepth = 3,
    DECORATOR_REGISTRY = GLOBAL_DECORATOR_REGISTRY,
    EMBEDDED_REGISTRY: embeddedRegistry,
  } = options ?? {};

  if (schema instanceof z.ZodObject) {
    return createObjectClass(schema, {
      exposeAll,
      maxObjectDepth,
      DECORATOR_REGISTRY,
      EMBEDDED_REGISTRY: embeddedRegistry,
    }) as any;
  }

  if (schema instanceof z.ZodDiscriminatedUnion) {
    const discriminator = (schema._def as any).discriminator as string;
    const optionMap = new Map<string, any>();
    const optionSchemas: z.ZodObject<any>[] = [];

    ((schema._def as any).options as z.ZodTypeAny[]).forEach((option: any) => {
      if (!(option instanceof z.ZodObject)) return;

      optionSchemas.push(option);

      const unwrapped = unwrapSchema(option.shape[discriminator]);

      if (unwrapped instanceof z.ZodLiteral) {
        const discriminatorValue =
          unwrapped.value !== null && unwrapped.value !== undefined
            ? String(unwrapped.value)
            : undefined;

        if (discriminatorValue !== undefined) {
          const OptionClass = createObjectClass(option, {
            exposeAll,
            maxObjectDepth,
            DECORATOR_REGISTRY,
          });
          optionMap.set(discriminatorValue, OptionClass);
        }
      }
    }); // Collect ALL properties from ALL options (union of all properties)
    const allProperties = new Map<string, z.ZodType>();

    for (const option of optionSchemas) {
      for (const [key, schema] of Object.entries(option.shape)) {
        if (!allProperties.has(key)) {
          allProperties.set(key, schema as z.ZodType);
        }
      }
    }

    class DiscriminatedUnionFactory {
      constructor(data: any) {
        const value = data?.[discriminator];
        const TargetClass = optionMap.get(value);

        if (TargetClass) {
          const instance = new TargetClass(data);
          Object.assign(this, instance);
          Object.setPrototypeOf(this, TargetClass.prototype);
          return this as any;
        }

        if (data) Object.assign(this, data);
      }
    }

    Object.defineProperty(DiscriminatedUnionFactory.prototype, 'constructor', {
      value: DiscriminatedUnionFactory,
      writable: true,
      enumerable: false,
      configurable: true,
    });

    for (const [key, fieldSchema] of allProperties) {
      if (exposeAll) {
        Expose()(DiscriminatedUnionFactory.prototype, key);
      }

      Validate(ZodFieldValidator, [fieldSchema])(
        DiscriminatedUnionFactory.prototype,
        key,
      );

      const designType = getDesignType(fieldSchema);
      if (designType) {
        Reflect.defineMetadata(
          'design:type',
          designType,
          DiscriminatedUnionFactory.prototype,
          key,
        );
      }
    }

    (DiscriminatedUnionFactory as any).__schema = schema;
    (DiscriminatedUnionFactory as any).__registry = DECORATOR_REGISTRY;
    (DiscriminatedUnionFactory as any).__allProperties = allProperties;

    (DiscriminatedUnionFactory as any).__copyMetadataToChild = function (
      childClass: any,
    ) {
      const childProto = childClass.prototype;
      const parentProto = DiscriminatedUnionFactory.prototype;

      for (const [key] of allProperties) {
        const designType = Reflect.getMetadata('design:type', parentProto, key);
        if (designType) {
          Reflect.defineMetadata('design:type', designType, childProto, key);
        }

        const metadataKeys = Reflect.getMetadataKeys(parentProto, key);
        metadataKeys.forEach((metadataKey) => {
          const metadata = Reflect.getMetadata(metadataKey, parentProto, key);
          Reflect.defineMetadata(metadataKey, metadata, childProto, key);
        });

        const fieldSchema = allProperties.get(key);
        if (fieldSchema) {
          const decorators = getRegistryDecorators(
            fieldSchema,
            DECORATOR_REGISTRY,
          );
          decorators.forEach((decorator) => {
            if (typeof decorator === 'function') {
              (decorator as PropertyDecorator)(childProto, key);
            }
          });
        }
      }

      const schemaDecorators = getRegistryDecorators(
        schema,
        DECORATOR_REGISTRY,
      );
      schemaDecorators.forEach((decorator) => {
        if (typeof decorator === 'function') {
          (decorator as ClassDecorator)(childClass);
        }
      });

      const classMetadataKeys = Reflect.getMetadataKeys(
        DiscriminatedUnionFactory,
      );
      classMetadataKeys.forEach((metadataKey) => {
        const metadata = Reflect.getMetadata(
          metadataKey,
          DiscriminatedUnionFactory,
        );
        Reflect.defineMetadata(metadataKey, metadata, childClass);
      });
    };

    return DiscriminatedUnionFactory as any;
  }

  if (schema instanceof z.ZodUnion) {
    const unionOptions = (schema._def as any).options as z.ZodTypeAny[];
    const objectOptions = unionOptions.filter(
      (opt) => opt instanceof z.ZodObject,
    );

    if (objectOptions.length === 0) {
      class PrimitiveUnionWrapper {
        value: any;

        constructor(data: any) {
          this.value = data;
        }
      }

      Object.defineProperty(PrimitiveUnionWrapper.prototype, 'constructor', {
        value: PrimitiveUnionWrapper,
        writable: true,
        enumerable: false,
        configurable: true,
      });

      if (
        !Object.prototype.hasOwnProperty.call(
          PrimitiveUnionWrapper.prototype,
          'value',
        )
      ) {
        Object.defineProperty(PrimitiveUnionWrapper.prototype, 'value', {
          value: undefined,
          writable: true,
          enumerable: false, // Set to false to avoid interfering with class-transformer
          configurable: true,
        });
      }

      Validate(ZodFieldValidator, [schema])(
        PrimitiveUnionWrapper.prototype,
        'value',
      );

      const WrapperClass = PrimitiveUnionWrapper as any;
      WrapperClass.options = [];

      WrapperClass.__schema = schema;
      WrapperClass.__registry = DECORATOR_REGISTRY;

      WrapperClass.__copyMetadataToChild = function (childClass: any) {
        const childProto = childClass.prototype;
        const parentProto = PrimitiveUnionWrapper.prototype;

        const designType = Reflect.getMetadata(
          'design:type',
          parentProto,
          'value',
        );
        if (designType) {
          Reflect.defineMetadata(
            'design:type',
            designType,
            childProto,
            'value',
          );
        }

        const metadataKeys = Reflect.getMetadataKeys(parentProto, 'value');
        metadataKeys.forEach((metadataKey) => {
          const metadata = Reflect.getMetadata(
            metadataKey,
            parentProto,
            'value',
          );
          Reflect.defineMetadata(metadataKey, metadata, childProto, 'value');
        });

        const schemaDecorators = getRegistryDecorators(
          schema,
          DECORATOR_REGISTRY,
        );
        schemaDecorators.forEach((decorator) => {
          if (typeof decorator === 'function') {
            (decorator as ClassDecorator)(childClass);
          }
        });

        const classMetadataKeys = Reflect.getMetadataKeys(
          PrimitiveUnionWrapper,
        );
        classMetadataKeys.forEach((metadataKey) => {
          const metadata = Reflect.getMetadata(
            metadataKey,
            PrimitiveUnionWrapper,
          );
          Reflect.defineMetadata(metadataKey, metadata, childClass);
        });
      };

      return WrapperClass;
    }

    const optionClasses = objectOptions.map((opt: z.ZodObject<any>) =>
      createObjectClass(opt, { exposeAll, maxObjectDepth, DECORATOR_REGISTRY }),
    );

    const intersectionKeys = new Set<string>();
    const firstShape = (objectOptions[0] as z.ZodObject<any>).shape;
    const firstKeys = Object.keys(firstShape);

    firstKeys.forEach((key) => {
      const allHaveKey = objectOptions.every(
        (opt) => key in (opt as z.ZodObject<any>).shape,
      );
      if (allHaveKey) {
        intersectionKeys.add(key);
      }
    });

    class UnionBase {
      constructor(data: any) {
        const matchIndex = unionOptions.findIndex(
          (opt) => opt.safeParse(data).success,
        );

        if (
          matchIndex !== -1 &&
          unionOptions[matchIndex] instanceof z.ZodObject
        ) {
          const classIndex =
            unionOptions
              .slice(0, matchIndex + 1)
              .filter((opt) => opt instanceof z.ZodObject).length - 1;

          if (classIndex >= 0 && optionClasses[classIndex]) {
            const TargetClass = optionClasses[classIndex];
            const instance = new TargetClass(data);
            Object.assign(this, instance);
            Object.setPrototypeOf(this, TargetClass.prototype);
            return this as any;
          }
        }

        if (data) Object.assign(this, data);
      }
    }

    Object.defineProperty(UnionBase.prototype, 'constructor', {
      value: UnionBase,
      writable: true,
      enumerable: false,
      configurable: true,
    });

    intersectionKeys.forEach((key) => {
      const firstOption = objectOptions[0] as z.ZodObject<any>;
      const fieldSchema = firstOption.shape[key];

      if (exposeAll) {
        Expose()(UnionBase.prototype, key);
      }

      Validate(ZodFieldValidator, [fieldSchema])(UnionBase.prototype, key);

      const designType = getDesignType(fieldSchema);
      if (designType) {
        Reflect.defineMetadata(
          'design:type',
          designType,
          UnionBase.prototype,
          key,
        );
      }
    });

    const UnionFactory = UnionBase as any;
    optionClasses.forEach((OptionClass, index) => {
      const optionName = `Option${index}`;
      UnionFactory[optionName] = OptionClass;
    });

    UnionFactory.options = optionClasses;

    UnionFactory.__schema = schema;
    UnionFactory.__registry = DECORATOR_REGISTRY;
    UnionFactory.__intersectionKeys = intersectionKeys;
    UnionFactory.__firstShape = firstShape;

    UnionFactory.__copyMetadataToChild = function (childClass: any) {
      const childProto = childClass.prototype;
      const parentProto = UnionBase.prototype;

      intersectionKeys.forEach((key) => {
        const designType = Reflect.getMetadata('design:type', parentProto, key);
        if (designType) {
          Reflect.defineMetadata('design:type', designType, childProto, key);
        }

        const metadataKeys = Reflect.getMetadataKeys(parentProto, key);
        metadataKeys.forEach((metadataKey) => {
          const metadata = Reflect.getMetadata(metadataKey, parentProto, key);
          Reflect.defineMetadata(metadataKey, metadata, childProto, key);
        });

        const fieldSchema = firstShape[key];
        if (fieldSchema) {
          const decorators = getRegistryDecorators(
            fieldSchema,
            DECORATOR_REGISTRY,
          );
          decorators.forEach((decorator) => {
            if (typeof decorator === 'function') {
              (decorator as PropertyDecorator)(childProto, key);
            }
          });
        }
      });

      const schemaDecorators = getRegistryDecorators(
        schema,
        DECORATOR_REGISTRY,
      );
      schemaDecorators.forEach((decorator) => {
        if (typeof decorator === 'function') {
          (decorator as ClassDecorator)(childClass);
        }
      });

      const classMetadataKeys = Reflect.getMetadataKeys(UnionBase);
      classMetadataKeys.forEach((metadataKey) => {
        const metadata = Reflect.getMetadata(metadataKey, UnionBase);
        Reflect.defineMetadata(metadataKey, metadata, childClass);
      });
    };

    return UnionFactory;
  }

  throw new Error(
    'ValidatedDto only supports ZodObject, ZodUnion, or ZodDiscriminatedUnion schemas',
  );
}

/** Value equality, covering value objects, dates, lists and nested objects. */
function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (a === null || a === undefined || b === null || b === undefined) {
    return a === b;
  }
  if (typeof (a as any).equals === 'function') {
    return (a as any).equals(b);
  }
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => valuesEqual(item, b[i]));
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const keysA = Object.keys(a as object);
    const keysB = Object.keys(b as object);
    return (
      keysA.length === keysB.length &&
      keysA.every((key) => valuesEqual((a as any)[key], (b as any)[key]))
    );
  }
  return false;
}

/**
 * Marks on the prototype that a class is a multi-field value object. Same role as
 * `SCALAR_VALUE_OBJECT`: every `Embeddable` generates its own base, so there is no common `instanceof`.
 */
export const EMBEDDABLE_VALUE_OBJECT = Symbol.for('validated-dto:embeddable');

/** The instance side an `Embeddable` adds to the generated DTO. */
export interface EmbeddableValueObject<Out> {
  /** **Value** equality, field by field — the `equals` of a Java `record`. */
  equals(other: unknown): boolean;
  /** A copy with some fields swapped. The value object does not change: it is replaced. */
  with(changes: Partial<Out>): this;
  /** The object ready for JSON, with embedded scalars already collapsed. */
  toJSON(): Record<string, unknown>;
  isValid(): boolean;
  validationError(): z.ZodError | undefined;
  assertValid(): this;
}

type AnyEmbeddableConstructor = abstract new (...args: any[]) => any;

/**
 * Generates a **multi-field value object** class — Java's `@Embeddable record`.
 *
 * It is `ValidatedDto` plus value object identity: `equals` by value, `with` to copy while swapping a
 * field, `toJSON`, and the `field()` that embeds it into another DTO as *this* class (rather than as an
 * anonymous class reassembled from the shape).
 *
 * ```ts
 * export class Money extends ValidatedDto.Embeddable(
 *   z.object({ amount: z.number().nonnegative(), currency: z.enum(['BRL', 'USD']) }),
 * ) {
 *   plus(other: Money): Money {
 *     return this.with({ amount: this.amount + other.amount });
 *   }
 * }
 *
 * const OrderSchema = z.object({ id: OrderId.field(), total: Money.field() });
 * ```
 */
export function Embeddable<Schema extends z.ZodObject<any>>(
  schema: Schema,
  options?: ValidatedDtoOptions,
): (new (
  data?: z.input<Schema>,
) => z.infer<Schema> & EmbeddableValueObject<z.infer<Schema>>) & {
  schema: Schema;
  parse<T extends AnyEmbeddableConstructor>(this: T, value: unknown): InstanceType<T>;
  safeParse<T extends AnyEmbeddableConstructor>(
    this: T,
    value: unknown,
  ):
    | { success: true; data: InstanceType<T>; error?: undefined }
    | { success: false; data?: undefined; error: z.ZodError };
  is<T extends AnyEmbeddableConstructor>(this: T, value: unknown): value is InstanceType<T>;
  field<T extends AnyEmbeddableConstructor>(
    this: T,
    options?: ScalarFieldOptions,
  ): z.ZodType<InstanceType<T>, z.input<Schema>>;
  __copyMetadataToChild(childClass: any): void;
} {
  const {
    exposeAll = true,
    maxObjectDepth = 3,
    DECORATOR_REGISTRY = GLOBAL_DECORATOR_REGISTRY,
    EMBEDDED_REGISTRY: embeddedRegistry,
  } = options ?? {};

  const Base = createObjectClass(schema, {
    exposeAll,
    maxObjectDepth,
    DECORATOR_REGISTRY,
    EMBEDDED_REGISTRY: embeddedRegistry,
  }) as any;

  const keys = Object.keys(schema.shape);

  Object.defineProperty(Base.prototype, EMBEDDABLE_VALUE_OBJECT, {
    value: true,
    enumerable: false,
    writable: false,
    configurable: false,
  });

  Object.defineProperties(Base.prototype, {
    equals: {
      value(this: any, other: unknown): boolean {
        if (other === null || typeof other !== 'object') {
          return false;
        }
        if ((other as any)[EMBEDDABLE_VALUE_OBJECT] === true && !(other instanceof Base)) {
          return false;
        }
        return keys.every((key) => valuesEqual(this[key], (other as any)[key]));
      },
      enumerable: false,
      writable: true,
      configurable: true,
    },
    with: {
      value(this: any, changes: Record<string, unknown>): any {
        return new (this.constructor as any)({ ...this.toJSON(), ...changes });
      },
      enumerable: false,
      writable: true,
      configurable: true,
    },
    toJSON: {
      value(this: any): Record<string, unknown> {
        return instanceToPlain(this);
      },
      enumerable: false,
      writable: true,
      configurable: true,
    },
    isValid: {
      value(this: any): boolean {
        return schema.safeParse(this).success;
      },
      enumerable: false,
      writable: true,
      configurable: true,
    },
    validationError: {
      value(this: any): z.ZodError | undefined {
        const result = schema.safeParse(this);
        return result.success ? undefined : result.error;
      },
      enumerable: false,
      writable: true,
      configurable: true,
    },
    assertValid: {
      value(this: any): any {
        const result = schema.safeParse(this);
        if (!result.success) {
          throw result.error;
        }
        return this;
      },
      enumerable: false,
      writable: true,
      configurable: true,
    },
  });

  Base.schema = schema;

  Base.parse = function parse(this: any, value: unknown): any {
    return new this(schema.parse(value) as any);
  };

  Base.safeParse = function safeParse(this: any, value: unknown): any {
    const result = schema.safeParse(value);
    return result.success
      ? { success: true, data: new this(result.data as any) }
      : { success: false, error: result.error };
  };

  Base.is = function is(this: any, value: unknown): boolean {
    return value instanceof this;
  };

  Base.field = function field(this: any, fieldOptions?: ScalarFieldOptions): z.ZodType {
    const decorators = fieldOptions?.decorators ?? [];
    if (decorators.length === 0) {
      const cached = EMBEDDABLE_FIELD_CACHE.get(this);
      if (cached) {
        return cached;
      }
    }
    const VO = this;
    const fieldSchema = z
      .unknown()
      .pipe(schema)
      .transform((parsed) => new VO(parsed)) as unknown as z.ZodType;

    EMBEDDED_REGISTRY.add(fieldSchema, { kind: 'object', target: VO });

    if (decorators.length > 0) {
      (fieldOptions?.DECORATOR_REGISTRY ?? DECORATOR_REGISTRY).add(fieldSchema, { decorators });
    } else {
      EMBEDDABLE_FIELD_CACHE.set(this, fieldSchema);
    }
    return fieldSchema;
  };

  return Base;
}

/** An embeddable's `field()` is stable per class, like the scalar's. */
const EMBEDDABLE_FIELD_CACHE = new WeakMap<object, z.ZodType>();

/**
 * The **single-value** value object — see {@link ValidatedScalar}.
 *
 * ```ts
 * export class PostId extends ValidatedDto.Scalar(PostIdSchema) {}
 * ```
 */
ValidatedDto.Scalar = ValidatedScalar as <Schema extends z.ZodType<any, any>>(
  schema: Schema,
  options?: ValidatedScalarOptions,
) => ScalarValueObjectStatic<z.output<Schema>, z.input<Schema>, Schema>;
/**
 * Embeds a value object into a DTO shape.
 *
 * ```ts
 * const PostViewSchema = z.object({
 *   id: ValidatedDto.embed(PostId),
 *   title: ValidatedDto.embed(PostTitle),
 * });
 * ```
 */
ValidatedDto.embed = function embed<T extends { field(options?: ScalarFieldOptions): z.ZodType }>(
  valueObject: T,
  options?: ScalarFieldOptions,
): ReturnType<T['field']> {
  return valueObject.field(options) as ReturnType<T['field']>;
};
