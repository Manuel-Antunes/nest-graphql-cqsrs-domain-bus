import { type Type } from "@nestjs/common";
import { Field, Int, ObjectType } from "@nestjs/graphql";

/** `PageInfo` da spec de Relay cursor connections. */
@ObjectType()
export class PageInfo {
  @Field()
  hasNextPage: boolean;

  @Field()
  hasPreviousPage: boolean;

  @Field(() => String, { nullable: true })
  startCursor: string | null;

  @Field(() => String, { nullable: true })
  endCursor: string | null;
}

export interface Edge<T> {
  cursor: string;
  node: T;
}

export interface ConnectionType<T> {
  edges: Edge<T>[];
  pageInfo: PageInfo;
  totalCount?: number | null;
}

/**
 * Gera os tipos `<Name>Connection` / `<Name>Edge` de uma Relay connection para um `@ObjectType`.
 *
 * É o padrão de tipos genéricos da documentação do @nestjs/graphql (a função-mixin `Paginated`) —
 * o equivalente code-first do `ConnectionTypeDefinitionConfigurer` do Spring GraphQL, que gerava os
 * mesmos tipos a partir do sufixo `Connection`. Um lugar só define o shape das duas connections do
 * projeto (`posts` e `Post.tags`).
 */
export function Connection<T>(classRef: Type<T>, name: string) {
  @ObjectType(`${name}Edge`)
  abstract class EdgeType implements Edge<T> {
    @Field(() => String)
    cursor: string;

    @Field(() => classRef)
    node: T;
  }

  @ObjectType({ isAbstract: true })
  abstract class AbstractConnection implements ConnectionType<T> {
    @Field(() => [EdgeType])
    edges: EdgeType[];

    @Field(() => PageInfo)
    pageInfo: PageInfo;

    @Field(() => Int, {
      nullable: true,
      description: "Total de itens; null quando a fonte não conta",
    })
    totalCount: number | null;
  }
  const Connection: typeof AbstractConnection & {
    EdgeType: typeof EdgeType;
  } = AbstractConnection as any;
  Connection.EdgeType = EdgeType;
  return Connection;
}
