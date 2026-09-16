import { Cursor } from "@mikro-orm/core";
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
 * Uma {@link Page} → a connection do protocolo.
 *
 * É a peça que o `Connections` da versão Java também tem, e pelo mesmo motivo: **nenhum flag de
 * `pageInfo` é calculado por quem chama**. `hasNextPage` sai da linha a mais que o `findByCursor`
 * pediu e descartou, os cursores saem do `page.from(item)`, e o `totalCount` do `count` que ele já
 * fez. Um resolver que refizesse essas contas à mão seria uma paginação que mente — e, com duas
 * connections servidas por cursor (`Query.posts` e `Author.posts`), mentiria em dois lugares
 * diferentes.
 *
 * O que fica do lado de quem chama é só o que é dele: como um item vira nó do protocolo.
 *
 * O parâmetro é uma {@link Page}, e não o `Cursor` do MikroORM, porque nem toda página vem do banco:
 * o `Cursor` satisfaz a interface, e o {@link pageOf} produz uma a partir de uma lista em memória. É o
 * que permite as **três** connections do schema — `posts`, `Author.posts` e `Post.tags` — dividirem o
 * mesmo envelope, em vez de duas o dividirem e a terceira o reescrever à mão.
 */
export interface Page<E> {
  readonly items: E[];
  /** O cursor daquele item — a posição dele na ordenação que produziu a página. */
  from(item: E): string;
  readonly hasNextPage: boolean;
  readonly hasPrevPage: boolean;
  readonly startCursor: string | null;
  readonly endCursor: string | null;
  readonly totalCount?: number;
}

/**
 * Uma página de uma lista **já em memória**, com cursores de posição absoluta.
 *
 * É o que `Post.tags` precisa: as tags vieram junto com o post, e paginar ali é recortar, não
 * consultar. O `Cursor.encode`/`decode` é o mesmo codec do MikroORM que as connections por keyset
 * usam — o que muda é o valor codificado (aqui, o índice), e não o formato, então um cursor continua
 * sendo opaco da mesma forma para quem o recebe.
 *
 * O que ela **não** é: uma paginação que escala. Recortar em memória só é honesto quando a lista
 * inteira já está carregada e é pequena por natureza — se as tags virarem uma relação aberta, o lugar
 * disto passa a ser uma consulta com `limit`, como em `Author.posts`.
 */
export function pageOf<E extends object>(
  items: readonly E[],
  limit: number,
  after?: string | null,
): Page<E> {
  const start = after ? Number(Cursor.decode(after)[0]) + 1 : 0;
  const slice = items.slice(start, start + limit);
  const cursors = new Map(slice.map((item, offset) => [item, Cursor.encode([start + offset])]));

  return {
    items: slice,
    from: (item) => cursors.get(item)!,
    hasNextPage: start + limit < items.length,
    hasPrevPage: start > 0,
    startCursor: cursors.get(slice[0]) ?? null,
    endCursor: cursors.get(slice[slice.length - 1]) ?? null,
    totalCount: items.length,
  };
}

export function connectionOf<E extends object, T>(
  page: Page<E>,
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
