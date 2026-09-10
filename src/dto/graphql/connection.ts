import type { Cursor } from "@mikro-orm/core";
import { z } from "zod";
import { InheritValidatedMetadata, ValidatedDto } from "../../validated-dto/mixins";

const PageInfoSchema = z.object({
  hasNextPage: z.boolean(),
  hasPreviousPage: z.boolean(),
  startCursor: z.string().nullable(),
  endCursor: z.string().nullable(),
});

/**
 * `PageInfo` da spec de Relay cursor connections.
 *
 * Não tem value object nenhum — um cursor é opaco por definição, e é isso que ele deve continuar
 * sendo. O que ele ganha de gerar a classe a partir do schema é a uniformidade: todo DTO deste
 * projeto declara o shape num lugar só.
 */
@InheritValidatedMetadata()
export class PageInfo extends ValidatedDto(PageInfoSchema) {}

export interface Edge<T> {
  cursor: string;
  node: T;
}

/**
 * O shape de uma Relay cursor connection — o tipo que os resolvers devolvem.
 *
 * No code-first isto era uma **função-mixin** (`Connection(PostView, 'Post')`), porque os tipos
 * `<Name>Connection` / `<Name>Edge` do protocolo precisavam existir como classes decoradas para o
 * gerador os enxergar. Com o schema-first eles já existem — estão escritos em `src/graphql/` —,
 * e o que sobra deste lado é o que sempre foi a única coisa que o TypeScript precisava: um tipo
 * genérico. Uma connection não tem comportamento; ela é a forma do que vai no fio.
 */
export interface ConnectionType<T> {
  edges: Edge<T>[];
  pageInfo: PageInfo;
  totalCount?: number | null;
}

/**
 * O `Cursor` do MikroORM → a connection do protocolo.
 *
 * É a peça que o `Connections` da versão Java também tem, e pelo mesmo motivo: **nenhum flag de
 * `pageInfo` é calculado por quem chama**. `hasNextPage` sai da linha a mais que o `findByCursor`
 * pediu e descartou, os cursores saem do `page.from(item)`, e o `totalCount` do `count` que ele já
 * fez. Um resolver que refizesse essas contas à mão seria uma paginação que mente — e, com duas
 * connections servidas por cursor (`Query.posts` e `Author.posts`), mentiria em dois lugares
 * diferentes.
 *
 * O que fica do lado de quem chama é só o que é dele: como um item vira nó do protocolo.
 */
export function connectionOf<E extends object, T>(
  page: Cursor<E>,
  node: (item: E) => T,
): ConnectionType<T> {
  const edges = page.items.map((item) => ({ cursor: page.from(item), node: node(item) }));
  return {
    edges,
    pageInfo: {
      hasNextPage: page.hasNextPage,
      hasPreviousPage: page.hasPrevPage,
      startCursor: page.startCursor,
      endCursor: page.endCursor,
    },
    totalCount: page.totalCount,
  };
}
