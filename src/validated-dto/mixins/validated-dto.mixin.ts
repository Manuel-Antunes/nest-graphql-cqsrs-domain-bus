import 'reflect-metadata';

import type {
  ValidationArguments,
  ValidatorConstraintInterface,
} from 'class-validator';
import {
  Expose,
  instanceToPlain,
  Transform,
  TransformationType,
  Type,
} from 'class-transformer';
import { Validate, ValidatorConstraint } from 'class-validator';
import { z } from 'zod';

import type { DECORATOR_REGISTRY_TYPE } from '../schemas/registries/decorators.registry';
import { DECORATOR_REGISTRY as GLOBAL_DECORATOR_REGISTRY } from '../schemas/registries/decorators.registry';
import type {
  EmbeddedBinding,
  EMBEDDED_REGISTRY_TYPE,
} from '../schemas/registries/embedded.registry';
import { EMBEDDED_REGISTRY, getEmbedded } from '../schemas/registries/embedded.registry';
import type {
  ScalarFieldOptions,
  ScalarValueObjectStatic,
  ValidatedScalarOptions,
} from './validated-scalar.mixin';
import { rawScalarValue, ValidatedScalar } from './validated-scalar.mixin';

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
    // Check if the parent class has the metadata copy helper
    const parentClass = Object.getPrototypeOf(target);
    if (
      parentClass &&
      typeof parentClass.__copyMetadataToChild === 'function'
    ) {
      parentClass.__copyMetadataToChild(target);
    }
  };
}

// --- 1. Zod 4 Validator ---
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

    // ZOD 4 STANDARD:
    // If the schema has a description, use it as the error label
    if (schema.description) {
      return `${schema.description} is invalid`;
    }

    if (!result.success) {
      return result.error.issues[0].message;
    }
    return 'Validation failed';
  }
}

// --- 2. Helper Functions ---

/**
 * Extract decorators from a schema's registry data
 * Uses Zod v4's registry system via DECORATOR_REGISTRY
 */
function getRegistryDecorators(
  schema: z.ZodType,
  DECORATOR_REGISTRY: DECORATOR_REGISTRY_TYPE = GLOBAL_DECORATOR_REGISTRY,
): Array<PropertyDecorator | ClassDecorator> {
  try {
    // Import the DECORATOR_REGISTRY dynamically to avoid circular dependencies
    // The registry must be imported from the consuming code
    const registryData = DECORATOR_REGISTRY.get(schema);
    const decorators: Array<PropertyDecorator | ClassDecorator> = [];

    // Start with isolated registry decorators if they exist
    if (registryData && Array.isArray(registryData.decorators)) {
      decorators.push(
        ...(registryData.decorators as Array<
          PropertyDecorator | ClassDecorator
        >),
      );
    }

    // Always include global decorators when using isolated registry, preventing duplicates
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
  } catch (e) {
    // Registry not available or malformed
  }
  return [];
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

  // Handle unions by returning the first option's type or Object
  if (unwrapped instanceof z.ZodUnion) {
    const firstOption = unwrapped.options[0];
    return firstOption ? getDesignType(firstOption as z.ZodType) : Object;
  }

  // Handle discriminated unions similarly
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
 * O que um campo embutido guarda: a classe do value object e se ele vem numa lista.
 *
 * `z.array(PostId.field())` embute o mesmo value object, item a item — daí o `isArray`.
 */
interface EmbeddedField {
  binding: EmbeddedBinding;
  isArray: boolean;
}

/** Descobre se um campo é um `VO.field()` — direto ou dentro de um array. */
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

/** Valor cru (ou já pronto) → a instância do value object. Nulos passam intactos. */
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
 * A instância do value object → o que vai no JSON.
 *
 * O escalar **colapsa** para o valor cru: um `PostId` sai como `"uuid"`, e não como `{ value: … }`.
 * É a diferença entre um `@Embeddable` de uma coluna só e um de várias — o segundo continua sendo um
 * objeto, e quem o achata é o próprio class-transformer.
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

// --- 3. Core Logic: Create Object Class ---
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

  // Pre-create union classes once to ensure consistent references
  const unionClassCache = new Map<string, any>();

  // Campos embutidos (`VO.field()`): o mixin precisa da classe para construir e para colapsar.
  const embeddedFields = new Map<string, EmbeddedField>();

  for (const key of Object.keys(shape)) {
    const innerType = unwrapSchema(shape[key] as z.ZodType);

    const embedded = embeddedFieldOf(innerType, options.EMBEDDED_REGISTRY);
    if (embedded) {
      embeddedFields.set(key, embedded);
    }

    // Pre-create union classes for nested unions
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
        // Apply data, which will trigger setters if any
        Object.assign(this, data);

        // For discriminated unions and unions as nested properties,
        // we need to instantiate them here since Transform decorators
        // only run during plainToInstance/instanceToPlain operations
        for (const key of Object.keys(shape)) {
          if ((data as any)[key] !== undefined && unionClassCache.has(key)) {
            const value = (data as any)[key];
            // Only instantiate if not already an instance
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

      // Apply Zod defaults for fields not provided in data
      for (const key of Object.keys(shape)) {
        if ((this as any)[key] === undefined) {
          const fieldSchema = shape[key] as z.ZodType;
          const result = fieldSchema.safeParse(undefined);
          if (result.success && result.data !== undefined) {
            (this as any)[key] = result.data;
          }
        }
      }

      // Value objects embutidos: o `new` monta a classe, e não só copia o valor cru. Vem depois dos
      // defaults de propósito — um `.default('x')` do Zod entrega o valor cru (ele não reparseia o
      // default), e é aqui que ele vira value object também.
      for (const [key, embedded] of embeddedFields) {
        const current = (this as any)[key];
        if (current !== undefined) {
          (this as any)[key] = materializeEmbedded(embedded, current);
        }
      }
    }
  }

  // Ensure the prototype has the correct constructor reference
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

    // Metadata: Expose
    if (exposeAll) {
      Expose()(GeneratedDto.prototype, key);
    }

    // Metadata: Validate
    Validate(ZodFieldValidator, [fieldSchema])(GeneratedDto.prototype, key);

    // NOTE: Registry decorators are NOT applied here.
    // They will be applied by @InheritValidatedMetadata() decorator on the child class.

    // Value object embutido de objeto (`@Embeddable` de várias colunas): é um DTO aninhado como
    // qualquer outro, então quem entra e sai dele é o `@Type` — só a classe é que passa a ser a
    // concreta, e não uma gerada na hora a partir do shape.
    if (embedded && embedded.binding.kind === 'object') {
      Type(() => embedded.binding.target as any)(GeneratedDto.prototype, key);
    }
    // Handle nested objects
    else if (innerType instanceof z.ZodObject && maxObjectDepth > 0) {
      const NestedClass = createObjectClass(innerType, {
        exposeAll,
        maxObjectDepth: maxObjectDepth - 1,
        DECORATOR_REGISTRY: options.DECORATOR_REGISTRY,
        EMBEDDED_REGISTRY: options.EMBEDDED_REGISTRY,
      });
      Type(() => NestedClass)(GeneratedDto.prototype, key);
    }
    // Handle arrays of nested objects
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
    // Handle unions in fields - use the cached union class
    else if (innerType instanceof z.ZodUnion) {
      const UnionClass = unionClassCache.get(key)!;
      Type(() => UnionClass)(GeneratedDto.prototype, key);
    }
    // Handle discriminated unions in fields - use the cached union class
    else if (innerType instanceof z.ZodDiscriminatedUnion) {
      const UnionClass = unionClassCache.get(key)!;
      Type(() => UnionClass)(GeneratedDto.prototype, key);
    }
    // Handle arrays of unions
    else if (
      innerType instanceof z.ZodArray &&
      (innerType.element instanceof z.ZodUnion ||
        innerType.element instanceof z.ZodDiscriminatedUnion)
    ) {
      // For arrays, we still need to create a new class since it's not cached
      const UnionClass = ValidatedDto(innerType.element, {
        exposeAll,
        maxObjectDepth: maxObjectDepth - 1,
      });
      Type(() => UnionClass)(GeneratedDto.prototype, key);
    }

    // Transform using Zod SafeParse to apply trim(), coerce(), etc.
    Transform(({ value, obj, type, options }) => {
      // If value is undefined and not present in the source object,
      // try to apply Zod defaults by parsing undefined
      if (value === undefined && !(key in obj)) {
        const result = fieldSchema.safeParse(undefined);
        return result.success
          ? embedded
            ? materializeEmbedded(embedded, result.data)
            : result.data
          : undefined;
      }

      // Value object embutido: a serialização colapsa para o valor cru e a desserialização monta a
      // classe. É a tradução que faz `PostId` atravessar o protocolo como `"uuid"` e voltar `PostId`.
      if (embedded) {
        return type === TransformationType.CLASS_TO_PLAIN
          ? plainifyEmbedded(embedded, value, options)
          : materializeEmbedded(embedded, value);
      }

      // Handle unions and discriminated unions
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

        // Check if all options are primitives (not ZodObject)
        const allPrimitives = options.every(
          (opt) => !(opt instanceof z.ZodObject),
        );

        if (allPrimitives) {
          // Primitive union: validate and return raw value
          const result = fieldSchema.safeParse(value);
          return result.success ? result.data : value;
        }

        // Object union: instantiate union class if needed
        if (
          value &&
          typeof value === 'object' &&
          value.constructor !== Object &&
          value.constructor !== Array
        ) {
          // Already an instance, return as-is
          return value;
        }

        // Use cached union class or fallback (shouldn't happen if cache is working)
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

    // Num campo embutido o `design:type` é a **classe** do value object — é o que um
    // `emitDecoratorMetadata` poria se o DTO tivesse sido escrito à mão com `id!: PostId`.
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
  // Apply class-level decorators from schema registry
  const classDecorators = getRegistryDecorators(
    schema,
    options.DECORATOR_REGISTRY,
  );
  classDecorators.forEach((decorator) => {
    if (typeof decorator === 'function') {
      (decorator as ClassDecorator)(GeneratedDto);
    }
  });

  // Helper function to copy metadata from GeneratedDto to any extending class
  // This is crucial for GraphQL and other frameworks that inspect the final class
  const OriginalClass = GeneratedDto;
  (OriginalClass as any).__copyMetadataToChild = function (childClass: any) {
    const childProto = childClass.prototype;
    const parentProto = OriginalClass.prototype;

    // Copy all metadata keys from parent to child for each property
    for (const key of Object.keys(shape)) {
      // Copy design:type metadata
      const designType = Reflect.getMetadata('design:type', parentProto, key);
      if (designType) {
        Reflect.defineMetadata('design:type', designType, childProto, key);
      }

      // Copy all other metadata keys that might have been set by decorators
      const metadataKeys = Reflect.getMetadataKeys(parentProto, key);
      metadataKeys.forEach((metadataKey) => {
        const metadata = Reflect.getMetadata(metadataKey, parentProto, key);
        Reflect.defineMetadata(metadataKey, metadata, childProto, key);
      });

      // Apply registry decorators to the child class
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

    // Apply schema-level decorators (class decorators) to the child class
    const schemaDecorators = getRegistryDecorators(
      schema,
      options.DECORATOR_REGISTRY,
    );
    schemaDecorators.forEach((decorator) => {
      if (typeof decorator === 'function') {
        (decorator as ClassDecorator)(childClass);
      }
    });

    // Copy class-level metadata
    const classMetadataKeys = Reflect.getMetadataKeys(OriginalClass);
    classMetadataKeys.forEach((metadataKey) => {
      const metadata = Reflect.getMetadata(metadataKey, OriginalClass);
      Reflect.defineMetadata(metadataKey, metadata, childClass);
    });
  };

  // Store schema and registry as static properties for child class decorator to access
  (GeneratedDto as any).__schema = schema;
  (GeneratedDto as any).__registry = options.DECORATOR_REGISTRY;

  return GeneratedDto as unknown as new (
    data?: Partial<z.input<typeof schema>>,
  ) => z.infer<typeof schema>;
};

// --- 4. Main Factory (with Union Support) ---
export interface ValidatedDtoOptions {
  exposeAll?: boolean;
  maxObjectDepth?: number;
  DECORATOR_REGISTRY?: DECORATOR_REGISTRY_TYPE;
  /** Onde procurar os value objects embutidos. O global cobre o caso normal. */
  EMBEDDED_REGISTRY?: EMBEDDED_REGISTRY_TYPE;
}

/**
 * `Omit` que **distribui** sobre uma união, em vez de achatá-la nas chaves comuns.
 *
 * O `Omit` normal é `Pick<T, Exclude<keyof T, K>>`, e `keyof (A | B)` é só a interseção das chaves —
 * então um schema de união discriminada perdia, no tipo do **construtor**, tudo que não fosse comum a
 * todas as variantes. Distribuindo, cada variante é recortada por si.
 *
 * Vale só para a entrada: o tipo da **instância** continua achatado de propósito, porque uma união
 * não serve de classe base (`class X extends ValidatedDto(uniao) {}` precisa de um tipo de objeto).
 */
type DistributiveOmit<T, K extends PropertyKey> = T extends any ? Omit<T, K> : never;

/**
 * ValidatedDto factory that supports:
 * - ZodObject schemas (original behavior)
 * - ZodDiscriminatedUnion schemas (optimized)
 * - ZodUnion schemas (fallback)
 */
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

  // --- CASE A: Standard Object (Original Behavior) ---
  if (schema instanceof z.ZodObject) {
    return createObjectClass(schema, {
      exposeAll,
      maxObjectDepth,
      DECORATOR_REGISTRY,
      EMBEDDED_REGISTRY: embeddedRegistry,
    }) as any;
  }

  // --- CASE B: Discriminated Union (Optimized) ---
  if (schema instanceof z.ZodDiscriminatedUnion) {
    const discriminator = (schema._def as any).discriminator as string;
    const optionMap = new Map<string, any>();
    const optionSchemas: z.ZodObject<any>[] = [];

    // Pre-generate a class for every option in the union
    ((schema._def as any).options as z.ZodTypeAny[]).forEach((option: any) => {
      if (!(option instanceof z.ZodObject)) return;

      optionSchemas.push(option);

      // Extract the discriminator value
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
    // Collect ALL properties from ALL options (for class-transformer serialization)
    const allProperties = new Map<string, z.ZodType>();

    for (const option of optionSchemas) {
      for (const [key, schema] of Object.entries(option.shape)) {
        if (!allProperties.has(key)) {
          allProperties.set(key, schema as z.ZodType);
        }
      }
    }

    // Create factory class with ALL union properties decorated
    class DiscriminatedUnionFactory {
      constructor(data: any) {
        const value = data?.[discriminator];
        const TargetClass = optionMap.get(value);

        if (TargetClass) {
          // Create instance of the specific class (already has full validation)
          const instance = new TargetClass(data);
          // Copy all properties from the matched instance
          Object.assign(this, instance);
          // Set the prototype for instanceof checks
          Object.setPrototypeOf(this, TargetClass.prototype);
          return this as any;
        }

        // Fallback: assign data for potential validation errors
        if (data) Object.assign(this, data);
      }
    }

    // Ensure the prototype has the correct constructor reference
    Object.defineProperty(DiscriminatedUnionFactory.prototype, 'constructor', {
      value: DiscriminatedUnionFactory,
      writable: true,
      enumerable: false,
      configurable: true,
    });

    // Decorate all properties for class-transformer compatibility
    for (const [key, fieldSchema] of allProperties) {
      if (exposeAll) {
        Expose()(DiscriminatedUnionFactory.prototype, key);
      }

      Validate(ZodFieldValidator, [fieldSchema])(
        DiscriminatedUnionFactory.prototype,
        key,
      );

      // NOTE: Registry decorators are NOT applied here.
      // They will be applied by @InheritValidatedMetadata() decorator on the child class.

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

    // Store schema, registry, and properties for child class decorator to access
    (DiscriminatedUnionFactory as any).__schema = schema;
    (DiscriminatedUnionFactory as any).__registry = DECORATOR_REGISTRY;
    (DiscriminatedUnionFactory as any).__allProperties = allProperties;

    // Helper function to copy metadata to child class (for InheritValidatedMetadata decorator)
    (DiscriminatedUnionFactory as any).__copyMetadataToChild = function (
      childClass: any,
    ) {
      const childProto = childClass.prototype;
      const parentProto = DiscriminatedUnionFactory.prototype;

      // Copy metadata for all union properties
      for (const [key] of allProperties) {
        // Copy design:type metadata
        const designType = Reflect.getMetadata('design:type', parentProto, key);
        if (designType) {
          Reflect.defineMetadata('design:type', designType, childProto, key);
        }

        // Copy all other metadata keys
        const metadataKeys = Reflect.getMetadataKeys(parentProto, key);
        metadataKeys.forEach((metadataKey) => {
          const metadata = Reflect.getMetadata(metadataKey, parentProto, key);
          Reflect.defineMetadata(metadataKey, metadata, childProto, key);
        });

        // Apply registry decorators to the child class
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

      // Apply schema-level decorators (class decorators) to the child class
      const schemaDecorators = getRegistryDecorators(
        schema,
        DECORATOR_REGISTRY,
      );
      schemaDecorators.forEach((decorator) => {
        if (typeof decorator === 'function') {
          (decorator as ClassDecorator)(childClass);
        }
      });

      // Copy class-level metadata
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

  // --- CASE C: Standard Union (Fallback) ---
  if (schema instanceof z.ZodUnion) {
    const unionOptions = (schema._def as any).options as z.ZodTypeAny[];
    const objectOptions = unionOptions.filter(
      (opt) => opt instanceof z.ZodObject,
    );

    // If ALL options are primitives (no objects), create a simple wrapper
    if (objectOptions.length === 0) {
      class PrimitiveUnionWrapper {
        value: any;

        constructor(data: any) {
          this.value = data;
        }
      }

      // Ensure the prototype has the correct constructor reference
      Object.defineProperty(PrimitiveUnionWrapper.prototype, 'constructor', {
        value: PrimitiveUnionWrapper,
        writable: true,
        enumerable: false,
        configurable: true,
      });

      // Define the property on the prototype so it exists as an "own property"
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

      // Apply decorator manually to avoid TypeScript decorator resolution issues
      Validate(ZodFieldValidator, [schema])(
        PrimitiveUnionWrapper.prototype,
        'value',
      );

      const WrapperClass = PrimitiveUnionWrapper as any;
      WrapperClass.options = [];

      // Store schema and registry for child class decorator to access
      WrapperClass.__schema = schema;
      WrapperClass.__registry = DECORATOR_REGISTRY;

      // Helper function to copy metadata to child class (for InheritValidatedMetadata decorator)
      WrapperClass.__copyMetadataToChild = function (childClass: any) {
        const childProto = childClass.prototype;
        const parentProto = PrimitiveUnionWrapper.prototype;

        // Copy metadata for the 'value' property
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

        // Apply schema-level decorators (class decorators) to the child class
        const schemaDecorators = getRegistryDecorators(
          schema,
          DECORATOR_REGISTRY,
        );
        schemaDecorators.forEach((decorator) => {
          if (typeof decorator === 'function') {
            (decorator as ClassDecorator)(childClass);
          }
        });

        // Copy class-level metadata
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

    // If there are ZodObject options, create classes for them
    const optionClasses = objectOptions.map((opt: z.ZodObject<any>) =>
      createObjectClass(opt, { exposeAll, maxObjectDepth, DECORATOR_REGISTRY }),
    );

    // Extract intersection properties (common to all object options)
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

    // Create a proper union base class with intersection properties
    class UnionBase {
      constructor(data: any) {
        // Try to find which schema matches the data
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
            // Copy all properties from the matched instance
            Object.assign(this, instance);
            // Set the prototype for instanceof checks
            Object.setPrototypeOf(this, TargetClass.prototype);
            return this as any;
          }
        }

        // Fallback: just assign data
        if (data) Object.assign(this, data);
      }
    }

    // Ensure the prototype has the correct constructor reference
    Object.defineProperty(UnionBase.prototype, 'constructor', {
      value: UnionBase,
      writable: true,
      enumerable: false,
      configurable: true,
    });

    // Add intersection properties with validation to the base class
    intersectionKeys.forEach((key) => {
      // Get the schema from the first option (they should all be compatible for intersection)
      const firstOption = objectOptions[0] as z.ZodObject<any>;
      const fieldSchema = firstOption.shape[key];

      if (exposeAll) {
        Expose()(UnionBase.prototype, key);
      }

      Validate(ZodFieldValidator, [fieldSchema])(UnionBase.prototype, key);

      // NOTE: Registry decorators are NOT applied here.
      // They will be applied by @InheritValidatedMetadata() decorator on the child class.

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

    // Expose option classes as static properties
    const UnionFactory = UnionBase as any;
    optionClasses.forEach((OptionClass, index) => {
      // Use a generic name or try to extract from schema
      const optionName = `Option${index}`;
      UnionFactory[optionName] = OptionClass;
    });

    // Also expose all options as an array
    UnionFactory.options = optionClasses;

    // Store schema, registry, and metadata for child class decorator to access
    UnionFactory.__schema = schema;
    UnionFactory.__registry = DECORATOR_REGISTRY;
    UnionFactory.__intersectionKeys = intersectionKeys;
    UnionFactory.__firstShape = firstShape;

    // Helper function to copy metadata to child class (for InheritValidatedMetadata decorator)
    UnionFactory.__copyMetadataToChild = function (childClass: any) {
      const childProto = childClass.prototype;
      const parentProto = UnionBase.prototype;

      // Copy metadata for all intersection properties
      intersectionKeys.forEach((key) => {
        // Copy design:type metadata
        const designType = Reflect.getMetadata('design:type', parentProto, key);
        if (designType) {
          Reflect.defineMetadata('design:type', designType, childProto, key);
        }

        // Copy all other metadata keys
        const metadataKeys = Reflect.getMetadataKeys(parentProto, key);
        metadataKeys.forEach((metadataKey) => {
          const metadata = Reflect.getMetadata(metadataKey, parentProto, key);
          Reflect.defineMetadata(metadataKey, metadata, childProto, key);
        });

        // Apply registry decorators to the child class
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

      // Apply schema-level decorators (class decorators) to the child class
      const schemaDecorators = getRegistryDecorators(
        schema,
        DECORATOR_REGISTRY,
      );
      schemaDecorators.forEach((decorator) => {
        if (typeof decorator === 'function') {
          (decorator as ClassDecorator)(childClass);
        }
      });

      // Copy class-level metadata
      const classMetadataKeys = Reflect.getMetadataKeys(UnionBase);
      classMetadataKeys.forEach((metadataKey) => {
        const metadata = Reflect.getMetadata(metadataKey, UnionBase);
        Reflect.defineMetadata(metadataKey, metadata, childClass);
      });
    };

    return UnionFactory;
  }

  // If none of the above, throw error
  throw new Error(
    'ValidatedDto only supports ZodObject, ZodUnion, or ZodDiscriminatedUnion schemas',
  );
}


// --- 5. Embeddable: o value object de vários campos ---------------------------------------------

/** Igualdade de valor, cobrindo value objects, datas, listas e objetos aninhados. */
function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (a === null || a === undefined || b === null || b === undefined) {
    return a === b;
  }
  // Quem sabe se comparar, se compara: escalares e embeddables têm `equals` próprio.
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
 * Marca no protótipo que uma classe é um value object de vários campos. Mesmo papel do
 * `SCALAR_VALUE_OBJECT`: cada `Embeddable` gera uma base própria, então não há `instanceof` comum.
 */
export const EMBEDDABLE_VALUE_OBJECT = Symbol.for('validated-dto:embeddable');

/** A parte de instância que um `Embeddable` acrescenta ao DTO gerado. */
export interface EmbeddableValueObject<Out> {
  /** Igualdade **de valor**, campo a campo — o `equals` de um `record` do Java. */
  equals(other: unknown): boolean;
  /** Uma cópia com alguns campos trocados. O value object não muda: ele é substituído. */
  with(changes: Partial<Out>): this;
  /** O objeto pronto para JSON, com os escalares embutidos já colapsados. */
  toJSON(): Record<string, unknown>;
  isValid(): boolean;
  validationError(): z.ZodError | undefined;
  assertValid(): this;
}

type AnyEmbeddableConstructor = abstract new (...args: any[]) => any;

/**
 * Gera a classe de um **value object de vários campos** — o `@Embeddable record` do Java.
 *
 * É o `ValidatedDto` mais a identidade de value object: `equals` por valor, `with` para copiar
 * trocando um campo, `toJSON`, e o `field()` que o embute em outro DTO já como *esta* classe (e não
 * como uma classe anônima remontada a partir do shape).
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
        // Um embeddable de **outra** família nunca é igual, ainda que o shape coincida: um `Money`
        // não é um `Weight`. Um objeto cru com os mesmos campos, sim — é o valor que se compara.
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

/** `field()` de um embeddable é estável por classe, como o do escalar. */
const EMBEDDABLE_FIELD_CACHE = new WeakMap<object, z.ZodType>();

// --- 6. A fachada: ValidatedDto.Scalar / .Embeddable / .embed -----------------------------------

/**
 * O value object de **um valor só** — ver {@link ValidatedScalar}.
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
 * Embute um value object num shape de DTO `.
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
