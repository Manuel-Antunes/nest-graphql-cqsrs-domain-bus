import { Type } from '@mikro-orm/core';
import { rawScalarValue } from '../../../../validated-dto/mixins';

/** O que a coluna precisa saber sobre o value object que ela guarda. */
export interface ValueObjectTypeOptions {
  /** O tipo da coluna no banco — `varchar(36)`, `text`… É o que o schema generator escreve. */
  columnType: string;
  /**
   * Como o `EntityComparator` compara o valor **cru** ao calcular o changeset. `string` serve para
   * todo value object de texto; um que envolva `Date` pede `date`.
   */
  compareAs?: string;
}

/** O mínimo que uma classe de value object escalar precisa expor para virar coluna. */
interface ScalarValueObjectClass<Instance> {
  readonly name: string;
  wrap(parsed: any): Instance;
  parse(value: unknown): Instance;
}

/**
 * A ponte entre um value object escalar e uma coluna do MikroORM.
 *
 * É o que permite `Post.id` ser um `PostId` de verdade — a classe, com `equals` e `toString` — sem
 * que o banco saiba disso: a coluna continua sendo `varchar(36)` guardando o texto. O `Type` do
 * MikroORM é o gancho oficial para isso, e este helper o gera a partir da própria classe:
 *
 * ```ts
 * const PostIdType = valueObjectType(PostId, { columnType: 'varchar(36)' });
 *
 * export const PostSchema = defineEntity({
 *   class: Post,
 *   properties: { id: p.type(PostIdType).primary(), … },
 * });
 * ```
 *
 * ## Os quatro sentidos da travessia
 * - **escrita** (`convertToDatabaseValue`): o value object vira o valor cru;
 * - **hidratação** (`convertToJSValue`): o valor cru vira o value object;
 * - **serialização / cursor** (`toJSON`): o valor cru de novo — é o que faz um cursor de paginação
 *   por `id` ser o texto, e não `{"value":"…"}`;
 * - **cursor de volta** (`fromJSON`): um cursor é dado do cliente, então aqui se **valida** — um
 *   cursor forjado vira `CursorError` em vez de um value object impossível.
 *
 * ## Hidratar não valida, e é de propósito
 * `convertToJSValue` usa `wrap`, que envolve sem passar pelo schema. É a mesma escolha que já valia
 * quando o campo era um tipo *branded*: o banco é fonte confiável, e revalidar toda linha lida
 * custaria um `safeParse` por coluna por linha. Quem valida é a fronteira — `decidir` (o `parse` dos
 * construtores nomeados) e `evoluir` (o `parse` dos handlers `on<Evento>`), onde o dado vem de fora.
 *
 * ## Consultar aceita os dois
 * `em.findOne(Post, { id })` funciona com o value object **ou** com o texto: o `convertToDatabaseValue`
 * roda igual nos dois casos, porque desembrulhar o que já é cru é a identidade.
 */
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

    /** Um cursor vem do cliente: aqui o `parse` vale a pena, e um valor impossível vira `CursorError`. */
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
