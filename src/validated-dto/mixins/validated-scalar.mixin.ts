import 'reflect-metadata';

import type {
  ValidationArguments,
  ValidatorConstraintInterface,
} from 'class-validator';
import { Expose, Transform } from 'class-transformer';
import { Validate, ValidatorConstraint } from 'class-validator';
import { z } from 'zod';

import type { DECORATOR_REGISTRY_TYPE } from '../schemas/registries/decorators.registry';
import { DECORATOR_REGISTRY as GLOBAL_DECORATOR_REGISTRY } from '../schemas/registries/decorators.registry';
import type { EMBEDDED_REGISTRY_TYPE } from '../schemas/registries/embedded.registry';
import { EMBEDDED_REGISTRY } from '../schemas/registries/embedded.registry';

// --- 1. Marcador e desembrulho ------------------------------------------------------------------

/**
 * Marca no protótipo que uma classe é um value object escalar. É um símbolo, e não um `instanceof`,
 * porque cada chamada de `ValidatedScalar` gera uma classe base diferente: `PostId` e `TagId` não têm
 * ancestral comum, mas os dois precisam ser reconhecidos como escalares por quem os recebe.
 */
export const SCALAR_VALUE_OBJECT = Symbol.for('validated-dto:scalar');

/** A base gerada pelo mixin — a "família" de um value object, usada pelo `equals`. */
const SCALAR_BASE = Symbol.for('validated-dto:scalar-base');

/** Cache do erro da última validação, para `isValid()` não re-parsear a cada chamada. */
const ISSUE_CACHE = Symbol.for('validated-dto:scalar-issues');

/** O gancho de `util.inspect` do Node — `console.log(postId)` sai legível. */
const INSPECT_CUSTOM = Symbol.for('nodejs.util.inspect.custom');

/** `true` se o valor é um value object escalar gerado por {@link ValidatedScalar}. */
export function isScalarValueObject(
  value: unknown,
): value is ScalarValueObject<unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as any)[SCALAR_VALUE_OBJECT] === true
  );
}

/**
 * O valor cru por trás de um value object — e o próprio valor, quando já é cru.
 *
 * É o desembrulho que deixa `new PostId(outroPostId)` e `new PostId('uuid')` serem a mesma chamada:
 * um value object aceita, na entrada, tudo que já *é* o valor dele.
 */
export function rawScalarValue(value: unknown): unknown {
  return isScalarValueObject(value) ? value.value : value;
}

// --- 2. Validador class-validator ---------------------------------------------------------------

/**
 * O `ValidatorConstraint` do campo `value` de um escalar.
 *
 * A diferença para o `ZodFieldValidator` do mixin de objeto é de onde vem o schema: aqui ele é lido
 * do **construtor da instância** (`this.constructor.schema`), e só cai na constraint capturada em
 * último caso. É o que faz uma subclasse que sobrescreve `static schema` validar pelas regras dela —
 * o gancho de "estender a classe para acrescentar regras específicas".
 */
@ValidatorConstraint({ name: 'ZodScalarValidator', async: false })
export class ZodScalarValidator implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    return this.schemaOf(args).safeParse(rawScalarValue(value)).success;
  }

  defaultMessage(args: ValidationArguments): string {
    const schema = this.schemaOf(args);
    const result = schema.safeParse(rawScalarValue(args.value));

    if (schema.description) {
      return `${schema.description} is invalid`;
    }
    if (!result.success) {
      return result.error.issues[0].message;
    }
    return 'Validation failed';
  }

  private schemaOf(args: ValidationArguments): z.ZodType {
    const fromInstance = (args.object as any)?.constructor?.schema;
    return (fromInstance ?? args.constraints[0]) as z.ZodType;
  }
}

// --- 3. Tipos públicos ---------------------------------------------------------------------------

/**
 * O valor como o JSON o enxerga. Só `Date` muda: o `JSON.stringify` chama `toJSON()` **uma** vez e
 * serializa o que voltar sem consultar o `toJSON` dele de novo — devolver o `Date` cru daria `{}`.
 */
export type JsonScalar<Out> = Out extends Date ? string : Out;

/** O resultado de `VO.safeParse` — o mesmo formato do Zod, com a instância no lugar do valor cru. */
export type ScalarSafeParseResult<T> =
  | { success: true; data: T; error?: undefined }
  | { success: false; data?: undefined; error: z.ZodError };

/** A parte de **instância** de um value object escalar. */
export interface ScalarValueObject<Out> {
  /** O valor, já normalizado pelo schema (trim, lowercase, coerce…). */
  readonly value: Out;
  readonly [SCALAR_VALUE_OBJECT]: true;
  /** O valor como texto — `String(vo)`, `` `${vo}` `` e template literals passam por aqui. */
  toString(): string;
  /** O valor pronto para JSON — é o que faz `JSON.stringify(dto)` enxergar o primitivo. */
  toJSON(): JsonScalar<Out>;
  /** O valor cru. Idem, e é o que faz `vo == 'texto'` e `vo1 < vo2` funcionarem. */
  valueOf(): Out;
  /** Igualdade **de valor**: dois value objects da mesma família com o mesmo valor são o mesmo. */
  equals(other: unknown): boolean;
  /** O valor atual passa pelo schema? */
  isValid(): boolean;
  /** O erro do schema para o valor atual, ou `undefined` se ele é válido. */
  validationError(): z.ZodError | undefined;
  /** Devolve `this`, ou lança o `ZodError` — o `parse` na forma de guarda. */
  assertValid(): this;
}

type AnyScalarConstructor = abstract new (...args: any[]) => ScalarValueObject<any>;

/** O que uma classe de value object escalar aceita construir. */
export type ScalarInput<Out, In> = In | ScalarValueObject<Out>;

/** As opções de `VO.field()` — o que este **uso** do value object acrescenta ao campo. */
export interface ScalarFieldOptions {
  /**
   * Decorators para o campo na classe final (`@Field()`, `@ApiProperty()`…), aplicados por
   * `@InheritValidatedMetadata()`.
   *
   * Passá-los faz o `field()` devolver um schema **novo** em vez do compartilhado: dois DTOs que
   * embutem o mesmo value object com decorators diferentes não podem dividir o mesmo campo.
   */
  decorators?: Array<PropertyDecorator | ClassDecorator>;
  DECORATOR_REGISTRY?: DECORATOR_REGISTRY_TYPE;
}

/**
 * A parte **estática** de um value object escalar. Todos os métodos usam `this` polimórfico, então
 * `PostId.parse(x)` devolve `PostId` — e não a base anônima que o mixin gerou.
 */
export interface ScalarValueObjectStatic<
  Out,
  In,
  Schema extends z.ZodType<any, any> = z.ZodType<Out, In>,
> {
  new (value: ScalarInput<Out, In>): ScalarValueObject<Out>;

  /**
   * O schema que define o valor — no tipo concreto, e não achatado em `ZodType`: `PostId.schema` é
   * um `ZodUUID` branded, com os métodos dele à mão. Uma subclasse pode sobrescrevê-lo para apertar
   * as regras (mas o caminho tipado para isso é o {@link ScalarValueObjectStatic.narrow}).
   */
  schema: Schema;
  /** Quando `true`, o construtor lança em vez de guardar um valor inválido. Default: `false`. */
  strict: boolean;

  /** Constrói validando: devolve a instância ou lança `ZodError`. */
  parse<T extends AnyScalarConstructor>(this: T, value: unknown): InstanceType<T>;
  /** Constrói validando, sem lançar. */
  safeParse<T extends AnyScalarConstructor>(
    this: T,
    value: unknown,
  ): ScalarSafeParseResult<InstanceType<T>>;
  /** Envolve um valor **já validado**, sem passar pelo schema de novo. */
  wrap<T extends AnyScalarConstructor>(this: T, parsed: Out): InstanceType<T>;
  /** Guarda de tipo: `value` é uma instância desta classe (ou de uma subclasse)? */
  is<T extends AnyScalarConstructor>(this: T, value: unknown): value is InstanceType<T>;

  /**
   * Uma base **com as regras mais apertadas** — o jeito tipado de especializar um value object.
   *
   * ```ts
   * class ShortTitle extends PostTitle.narrow((title) => title.max(40, 'curto demais')) {}
   * ```
   *
   * O tipo continua sendo o da classe de origem (um `ShortTitle` *é* um `PostTitle`), e é só o
   * schema que muda — por isso o `.brand()` não precisa ser repetido, ao contrário do que acontece
   * ao sobrescrever `static schema` na mão.
   */
  narrow<T extends AnyScalarConstructor>(
    this: T,
    refine: (schema: Schema) => z.ZodType<any, any>,
  ): T;
  /** `true` se o valor cru passa pelo schema — sem construir nada. */
  accepts(value: unknown): boolean;

  /**
   * O schema para **embutir** este value object num `z.object` de DTO — o `@Embedded` do Java.
   *
   * O campo aceita o valor cru (ou outro value object) na entrada e produz a instância na saída, e o
   * mixin de objeto o reconhece pelo `EMBEDDED_REGISTRY`: serializa colapsando para o valor cru,
   * desserializa construindo a classe. É estável por classe — chamar duas vezes devolve o mesmo
   * schema.
   */
  field<T extends AnyScalarConstructor>(
    this: T,
    options?: ScalarFieldOptions,
  ): z.ZodType<InstanceType<T>, ScalarInput<Out, In>>;

  /** Copia a metadata para uma subclasse — o gancho de `@InheritValidatedMetadata()`. */
  __copyMetadataToChild(childClass: any): void;
}

export interface ValidatedScalarOptions {
  /**
   * O nome da **base gerada**. Quase sempre desnecessário: o normal é estender
   * (`class Email extends ValidatedDto.Scalar(schema) {}`), e aí quem nomeia é o JavaScript — a
   * subclasse já se chama `Email`, e é o `constructor.name` dela que aparece no `inspect` e nas
   * mensagens. Só vale passar quando a base é usada **sem** subclasse.
   *
   * Não dá para derivar isto da `brand`: no Zod 4 `.brand()` devolve `this` e não guarda nada — o
   * argumento em `.brand<'Email'>('Email')` é descartado, e a marca existe só no tipo.
   */
  name?: string;
  /** Aplica `@Expose()` em `value` (default `true`), como o `exposeAll` do mixin de objeto. */
  exposeAll?: boolean;
  /** O construtor lança em vez de guardar valor inválido (default `false`). */
  strict?: boolean;
  DECORATOR_REGISTRY?: DECORATOR_REGISTRY_TYPE;
  EMBEDDED_REGISTRY?: EMBEDDED_REGISTRY_TYPE;
}

// --- 4. Utilitários internos ---------------------------------------------------------------------

/** Igualdade de valores crus, cobrindo os casos em que `===` não serve. */
function sameRawValue(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => sameRawValue(item, b[i]));
  }
  if (typeof a === 'number' && typeof b === 'number') {
    return a === b || (Number.isNaN(a) && Number.isNaN(b));
  }
  return a === b;
}

/** O texto de um valor cru. Datas viram ISO — o formato que atravessa protocolo. */
function rawToString(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? 'Invalid Date' : value.toISOString();
  }
  return String(value);
}

/** `field()` é estável por classe: o mesmo schema para o mesmo value object. */
const FIELD_SCHEMA_CACHE = new WeakMap<object, z.ZodType>();

function registryDecorators(
  schema: z.ZodType,
  registry: DECORATOR_REGISTRY_TYPE = GLOBAL_DECORATOR_REGISTRY,
): Array<PropertyDecorator | ClassDecorator> {
  const decorators: Array<PropertyDecorator | ClassDecorator> = [];
  const own = registry.get(schema);
  if (own && Array.isArray(own.decorators)) {
    decorators.push(...(own.decorators as Array<PropertyDecorator | ClassDecorator>));
  }
  if (registry !== GLOBAL_DECORATOR_REGISTRY) {
    const global = GLOBAL_DECORATOR_REGISTRY.get(schema);
    if (global && Array.isArray(global.decorators)) {
      global.decorators.forEach((decorator) => {
        const typed = decorator as PropertyDecorator | ClassDecorator;
        if (!decorators.includes(typed)) {
          decorators.push(typed);
        }
      });
    }
  }
  return decorators;
}

/** O `design:type` de um escalar — o que o `emitDecoratorMetadata` poria se a classe fosse escrita à mão. */
function scalarDesignType(schema: z.ZodType): any {
  let current: z.ZodType = schema;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (current instanceof z.ZodOptional || current instanceof z.ZodNullable) {
      current = current.unwrap() as z.ZodType;
    } else if (current instanceof z.ZodDefault) {
      current = (current._def as any).innerType as z.ZodType;
    } else if (current instanceof z.ZodPipe) {
      current = (current._def as any).out as z.ZodType;
    } else if (current instanceof z.ZodTransform) {
      return Object;
    } else {
      break;
    }
  }

  if (current instanceof z.ZodNumber) return Number;
  if (current instanceof z.ZodString) return String;
  if (current instanceof z.ZodBoolean) return Boolean;
  if (current instanceof z.ZodDate) return Date;
  if (current instanceof z.ZodArray) return Array;
  if (current instanceof z.ZodBigInt) return BigInt;
  return Object;
}

// --- 5. A fábrica ---------------------------------------------------------------------------------

/**
 * Gera a classe de um **value object escalar** a partir de um schema Zod de valor único — tipicamente
 * um schema *branded*.
 *
 * É o irmão do `ValidatedDto`: onde aquele recebe um objeto e gera uma classe com um campo por chave,
 * este recebe **um valor** e gera uma classe de um campo só (`value`) que se comporta como esse valor.
 *
 * ```ts
 * export class PostTitle extends ValidatedDto.Scalar(PostTitleSchema) {
 *   // regra específica desta classe, além das que o schema já garante
 *   isQuestion(): boolean {
 *     return this.value.endsWith('?');
 *   }
 * }
 *
 * PostTitle.parse('  Olá  ').value; // 'Olá' — normalizado pelo schema
 * `${new PostTitle('Olá')}`;        // 'Olá'  — toString
 * JSON.stringify({ t: new PostTitle('Olá') }); // {"t":"Olá"} — toJSON
 * ```
 *
 * ## O que a classe ganha
 * `toString` / `toJSON` / `valueOf` / `Symbol.toPrimitive` (o value object *é* o valor onde um valor
 * é esperado — inclusive nos scalars do GraphQL, que chamam `valueOf`/`toJSON` ao serializar),
 * `equals` (igualdade de valor, não de referência), `isValid` / `assertValid`, os estáticos
 * `parse` / `safeParse` / `is` / `accepts` e o `field()`, que embute o value object num DTO.
 *
 * ## Regras gerais x regras específicas
 * As **gerais** moram no schema Zod — é ele que normaliza e valida. As **específicas** entram por
 * herança: métodos novos (como o `isQuestion` acima) ou um schema mais apertado, que o construtor, o
 * `parse` e o validador do class-validator leem dinamicamente do `this.constructor`.
 *
 * ```ts
 * class HeadlineTitle extends PostTitle.narrow((title) => title.max(40, 'headline curta demais')) {}
 * ```
 *
 * O `narrow` é o caminho tipado: um `HeadlineTitle` continua sendo um `PostTitle`. Sobrescrever
 * `static schema` na mão também vale, mas aí a `brand` precisa ser remarcada no fim da cadeia
 * (`PostTitleSchema.max(40).brand<'PostTitle'>()`) — as refinações do Zod não a carregam adiante.
 *
 * ## O nome vem da subclasse
 * Não é preciso informá-lo: `class PostTitle extends ValidatedDto.Scalar(schema) {}` já produz uma
 * classe chamada `PostTitle`, e é esse `constructor.name` que o `inspect` e as mensagens usam. A
 * `brand` do schema **não** serve para isso — no Zod 4 ela é só tipo, e `.brand('X')` descarta o
 * argumento. A option `name` existe para o caso raro de usar a base sem estender.
 *
 * ## Validar não é lançar
 * O construtor **não lança** por padrão — ele guarda o valor inválido para o `class-validator`
 * reportar, exatamente como o mixin de objeto faz. Para o caminho que lança, use `VO.parse(...)` (ou
 * `{ strict: true }`, que faz o `new` lançar também).
 */
export function ValidatedScalar<Schema extends z.ZodType<any, any>>(
  schema: Schema,
  options: ValidatedScalarOptions = {},
): ScalarValueObjectStatic<z.output<Schema>, z.input<Schema>, Schema> {
  type Out = z.output<Schema>;
  type In = z.input<Schema>;

  const {
    name,
    exposeAll = true,
    strict = false,
    DECORATOR_REGISTRY = GLOBAL_DECORATOR_REGISTRY,
    EMBEDDED_REGISTRY: embeddedRegistry = EMBEDDED_REGISTRY,
  } = options;

  if (schema instanceof z.ZodObject) {
    throw new Error(
      'ValidatedDto.Scalar espera um schema de valor único; para um objeto use ValidatedDto.Embeddable',
    );
  }

  class GeneratedScalar {
    /** O schema é estático para que a herança o alcance — e a possa sobrescrever. */
    static schema: z.ZodType<Out, In> = schema as unknown as z.ZodType<Out, In>;
    static strict = strict;

    readonly value: Out;

    constructor(value: ScalarInput<Out, In>) {
      const ctor = this.constructor as typeof GeneratedScalar;
      const raw = rawScalarValue(value);
      const result = ctor.schema.safeParse(raw);

      if (!result.success && ctor.strict) {
        throw result.error;
      }

      // Sucesso guarda o valor **normalizado** (trim, lowercase, coerce…); falha guarda o cru, para
      // que o class-validator tenha o que reportar em vez de um `undefined` sem história.
      this.value = (result.success ? result.data : raw) as Out;
      this.cacheIssues(this.value, result.success ? undefined : result.error);
    }

    // ---- o value object *é* o valor -----------------------------------------------------------

    toString(): string {
      return rawToString(this.value);
    }

    toJSON(): any {
      // O `Date` é o único caso em que o valor cru não é JSON: ver {@link JsonScalar}.
      const value = this.value as unknown;
      return value instanceof Date ? value.toISOString() : value;
    }

    valueOf(): Out {
      return this.value;
    }

    [Symbol.toPrimitive](hint: 'number' | 'string' | 'default'): any {
      const value = this.value as unknown;
      if (value instanceof Date) {
        return hint === 'number' ? value.getTime() : value.toISOString();
      }
      if (hint === 'number') return Number(value);
      if (hint === 'string') return this.toString();
      return value;
    }

    /** `console.log(postId)` mostra `PostId('uuid')`, e não `PostId { value: 'uuid' }`. */
    [INSPECT_CUSTOM](): string {
      return `${this.constructor.name}(${JSON.stringify(this.value)})`;
    }

    // ---- igualdade ------------------------------------------------------------------------------

    /**
     * Igualdade de **valor**, dentro da família: `new PostId(x).equals(new PostId(x))` é `true`,
     * e comparar com o valor cru também. Um `TagId` com o mesmo texto não é igual a um `PostId` —
     * é justamente para isso que os dois são tipos diferentes.
     */
    equals(other: unknown): boolean {
      if (other === null || other === undefined) {
        return false;
      }
      if (isScalarValueObject(other)) {
        const mine = (this.constructor as any)[SCALAR_BASE];
        const theirs = (other.constructor as any)[SCALAR_BASE];
        if (mine !== theirs) {
          return false;
        }
        return sameRawValue(this.value, other.value);
      }
      return sameRawValue(this.value, other);
    }

    // ---- validação ------------------------------------------------------------------------------

    isValid(): boolean {
      return this.validationError() === undefined;
    }

    validationError(): z.ZodError | undefined {
      const cached = (this as any)[ISSUE_CACHE];
      if (cached && sameRawValue(cached.for, this.value)) {
        return cached.error;
      }
      const ctor = this.constructor as typeof GeneratedScalar;
      const result = ctor.schema.safeParse(this.value);
      const error = result.success ? undefined : result.error;
      this.cacheIssues(this.value, error);
      return error;
    }

    assertValid(): this {
      const error = this.validationError();
      if (error) {
        throw error;
      }
      return this;
    }

    /** O cache é não-enumerável: ele não pode vazar para o `instanceToPlain` nem para o `JSON`. */
    private cacheIssues(forValue: unknown, error: z.ZodError | undefined): void {
      Object.defineProperty(this, ISSUE_CACHE, {
        value: { for: forValue, error },
        enumerable: false,
        writable: true,
        configurable: true,
      });
    }

    // ---- estáticos ------------------------------------------------------------------------------

    static parse(this: any, value: unknown): any {
      const parsed = this.schema.parse(rawScalarValue(value));
      return this.wrap(parsed);
    }

    static safeParse(this: any, value: unknown): any {
      const result = this.schema.safeParse(rawScalarValue(value));
      return result.success
        ? { success: true, data: this.wrap(result.data) }
        : { success: false, error: result.error };
    }

    /**
     * Envolve um valor que **já passou** pelo schema, sem parsear de novo — é o que o `parse` e o
     * `field()` usam, para que um schema com `.transform()` não seja aplicado duas vezes.
     *
     * Uma subclasse com construtor próprio (estado derivado, por exemplo) deve sobrescrever este
     * método também; a base não tem como adivinhar o que aquele construtor faz.
     */
    static wrap(this: any, parsed: unknown): any {
      const instance = Object.create(this.prototype);
      instance.value = parsed;
      Object.defineProperty(instance, ISSUE_CACHE, {
        value: { for: parsed, error: undefined },
        enumerable: false,
        writable: true,
        configurable: true,
      });
      return instance;
    }

    static is(this: any, value: unknown): boolean {
      return value instanceof this;
    }

    static narrow(this: any, refine: (schema: any) => any): any {
      const refined = refine(this.schema);
      class NarrowedScalar extends this {
        static schema = refined;
      }
      Object.defineProperty(NarrowedScalar, 'name', {
        value: this.name,
        writable: false,
        enumerable: false,
        configurable: true,
      });
      return NarrowedScalar;
    }

    static accepts(this: any, value: unknown): boolean {
      return this.schema.safeParse(rawScalarValue(value)).success;
    }

    static field(this: any, fieldOptions?: ScalarFieldOptions): z.ZodType {
      // Um campo com decorators próprios é sempre um schema novo: o cache é o campo "sem dono".
      const decorators = fieldOptions?.decorators ?? [];
      if (decorators.length === 0) {
        const cached = FIELD_SCHEMA_CACHE.get(this);
        if (cached) {
          return cached;
        }
      }

      const VO = this;
      // `unknown → desembrulha → schema do value object → instância`: as mensagens de erro continuam
      // sendo as do schema (é ele quem valida no meio do cano), a entrada aceita valor cru **ou**
      // value object, e a saída é sempre a instância.
      const fieldSchema = z
        .unknown()
        .transform((value) => rawScalarValue(value))
        .pipe(VO.schema)
        .transform((parsed) => VO.wrap(parsed)) as unknown as z.ZodType;

      embeddedRegistry.add(fieldSchema, { kind: 'scalar', target: VO });

      if (decorators.length > 0) {
        (fieldOptions?.DECORATOR_REGISTRY ?? DECORATOR_REGISTRY).add(fieldSchema, {
          decorators,
        });
      } else {
        FIELD_SCHEMA_CACHE.set(this, fieldSchema);
      }
      return fieldSchema;
    }

    /**
     * Copia a metadata da base para a subclasse e aplica os decorators do registry.
     *
     * Mesma função do homônimo do mixin de objeto, e por isso o mesmo `@InheritValidatedMetadata()`
     * serve para os dois — frameworks que inspecionam a classe final (GraphQL, Swagger) enxergam o
     * `value` decorado.
     */
    static __copyMetadataToChild(childClass: any): void {
      const childProto = childClass.prototype;
      const parentProto = GeneratedScalar.prototype;

      Reflect.getMetadataKeys(parentProto, 'value').forEach((metadataKey) => {
        Reflect.defineMetadata(
          metadataKey,
          Reflect.getMetadata(metadataKey, parentProto, 'value'),
          childProto,
          'value',
        );
      });

      registryDecorators(schema, DECORATOR_REGISTRY).forEach((decorator) => {
        if (typeof decorator === 'function') {
          (decorator as PropertyDecorator)(childProto, 'value');
        }
      });

      Reflect.getMetadataKeys(GeneratedScalar).forEach((metadataKey) => {
        Reflect.defineMetadata(
          metadataKey,
          Reflect.getMetadata(metadataKey, GeneratedScalar),
          childClass,
        );
      });
    }
  }

  // O marcador vai no protótipo: toda instância o tem, nenhuma o serializa.
  Object.defineProperty(GeneratedScalar.prototype, SCALAR_VALUE_OBJECT, {
    value: true,
    enumerable: false,
    writable: false,
    configurable: false,
  });

  Object.defineProperty(GeneratedScalar, SCALAR_BASE, {
    value: GeneratedScalar,
    enumerable: false,
    writable: false,
    configurable: false,
  });

  // A base só precisa de nome quando alguém a usa sem estender; ao estender, o JavaScript nomeia a
  // subclasse e é ela que aparece em toda parte. `ScalarValueObject` é um fallback mais honesto que
  // o nome da classe interna.
  Object.defineProperty(GeneratedScalar, 'name', {
    value: name ?? 'ScalarValueObject',
    writable: false,
    enumerable: false,
    configurable: true,
  });

  if (exposeAll) {
    Expose()(GeneratedScalar.prototype, 'value');
  }

  Validate(ZodScalarValidator, [schema])(GeneratedScalar.prototype, 'value');

  // `plainToInstance(PostId, { value: '  x  ' })` normaliza pelo schema, como no mixin de objeto.
  Transform(({ value }) => {
    const result = schema.safeParse(rawScalarValue(value));
    return result.success ? result.data : value;
  })(GeneratedScalar.prototype, 'value');

  Reflect.defineMetadata(
    'design:type',
    scalarDesignType(schema),
    GeneratedScalar.prototype,
    'value',
  );

  registryDecorators(schema, DECORATOR_REGISTRY).forEach((decorator) => {
    if (typeof decorator === 'function') {
      (decorator as ClassDecorator)(GeneratedScalar as any);
    }
  });

  (GeneratedScalar as any).__schema = schema;
  (GeneratedScalar as any).__registry = DECORATOR_REGISTRY;

  return GeneratedScalar as unknown as ScalarValueObjectStatic<Out, In, Schema>;
}
