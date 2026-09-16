import { typeConverter, type MappingConfiguration } from '@automapper/core';
import type { ScalarValueObject } from '../../validated-dto/mixins';

/** O que um value object escalar pode embrulhar — o tipo "original", antes de virar classe. */
type RawConstructor =
  | StringConstructor
  | NumberConstructor
  | BooleanConstructor
  | DateConstructor;

/** O valor que um construtor cru produz: `String` → `string`, `Date` → `Date`. */
type RawValue<R extends RawConstructor> = R extends DateConstructor
  ? Date
  : ReturnType<Extract<R, StringConstructor | NumberConstructor | BooleanConstructor>>;

/** A classe de um value object escalar: constrói a partir do valor cru e expõe o `.value`. */
type ScalarValueObjectClass<Raw> = new (raw: any) => ScalarValueObject<Raw>;

/**
 * A travessia **value object ↔ valor cru**, nos dois sentidos, para um par de tipos.
 *
 * ```ts
 * protected override get mappingConfigurations(): MappingConfiguration[] {
 *   return [valueObjectConverter(PostTitle, String), valueObjectConverter(TagId, String)];
 * }
 * ```
 *
 * É o que dispensa um `forMember` por campo de texto — eram 24 dessas linhas nos mappers escritos à
 * mão que este diretório substituiu, e cada uma era uma chance de escrever o campo errado. Com o
 * conversor declarado, `title`, `content` e `authorId` voltam a ser o que sempre foram: campos de
 * mesmo nome, copiados sozinhos.
 *
 * ## Por que o tipo cru é parâmetro, e não deduzido
 * Porque só quem declara sabe. Um `PostTitle` embrulha texto, mas nada impede um value object de
 * embrulhar um número ou uma data — e o `typeConverter` é registrado **por par** (origem, destino),
 * então errar o tipo cru não é um erro de compilação: é um conversor que nunca casa, e um campo que
 * atravessa sem converter.
 *
 * ## Um `MappingConfiguration`, dois sentidos
 * Os dois `typeConverter` vão juntos de propósito: um value object que sabe virar texto e não sabe
 * voltar é meia regra, e a metade que falta só aparece no dia em que alguém mapear na outra direção.
 * Quem chama declara **o par de tipos**, e não o sentido.
 *
 * ## Por que `new VO(...)` e não `VO.parse(...)`
 * Pela mesma razão que o construtor do `ValidatedDto` materializa os embutidos com `new`: **construir
 * não lança**. Quem valida é o domínio, e um título inválido precisa chegar ao agregado para receber
 * de lá a mensagem certa. Um `parse` aqui transformaria um `BAD_USER_INPUT` bem explicado num erro de
 * mapeamento.
 *
 * ## Por que nulos passam intactos
 * O conversor roda **sempre**, inclusive quando o campo é opcional e veio ausente — `title` e
 * `content` do `updatePost` são esse caso, e ali `null` não é um valor a converter: é a instrução de
 * manter o que está lá.
 */
export function valueObjectConverter<R extends RawConstructor>(
  ValueObject: ScalarValueObjectClass<RawValue<R>>,
  Raw: R,
): MappingConfiguration {
  // Os dois `as never` são do **tipo de retorno** do seletor, e não do que ele faz: o
  // `typeConverter` deriva o valor esperado por um condicional sobre o construtor, e um condicional
  // não resolve enquanto `R` for genérico. Quem garante o par é a assinatura desta função.
  const unwrap = typeConverter(ValueObject, Raw, ((vo: ScalarValueObject<RawValue<R>>) =>
    vo == null ? vo : vo.value) as never);
  const wrap = typeConverter(Raw, ValueObject, ((raw: RawValue<R>) =>
    raw == null ? raw : new ValueObject(raw)) as never);

  return (mapping) => {
    unwrap(mapping);
    wrap(mapping);
  };
}
