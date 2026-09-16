import type { Mapper, ModelIdentifier } from "@automapper/core";
import { InjectMapper } from "@automapper/nestjs";
import {
  mixin,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
  type Type,
} from "@nestjs/common";
import { concatMap, type Observable } from "rxjs";
import {
  connectionOf,
  type ConnectionType,
  type Page,
} from "../../dto/graphql/connection";

/** Uma {@link Page} → uma Relay cursor connection, com os nós **como vieram**. */
export function ConnectionInterceptor(): Type<NestInterceptor>;
/** O mesmo, **traduzindo cada nó**: a página entra com agregados, a connection sai com views. */
export function ConnectionInterceptor<
  TSource extends Record<string, any>,
  TDestination extends Record<string, any>,
>(
  from: ModelIdentifier<TSource>,
  to: ModelIdentifier<TDestination>,
  options?: { mapperName?: string },
): Type<NestInterceptor>;

/**
 * Uma {@link Page} → uma Relay cursor connection. O envelope das **três** connections do schema.
 *
 * ```ts
 * @UseInterceptors(ConnectionInterceptor(Post, PostView))  // Query.posts, Author.posts
 * @UseInterceptors(ConnectionInterceptor())                // Post.tags
 * ```
 *
 * ## Os dois usos são o mesmo interceptor, e é de propósito
 * O que muda entre eles é uma coisa só: se os nós passam pelo mapper. Em `Query.posts` a página vem do
 * banco com agregados, e o nó precisa virar view; em `Post.tags` a página é um recorte de
 * `PostView.tags`, que **já** é `TagView[]` — quem traduziu foi o `Post → PostView`, lá atrás, e
 * mapear de novo seria traduzir o que já está traduzido.
 *
 * Duas exportações diriam a mesma coisa, mas com dois formatos de chamada — um com parênteses e outro
 * sem —, e trocar um pelo outro é o tipo de engano que compila. Uma sobrecarga mantém o formato: o par
 * de modelos é o que se acrescenta quando há tradução, e não outra peça.
 *
 * ## Por que não o `MapInterceptor` da lib
 * Porque uma connection não é um `Post` nem uma lista de `Post`: é um envelope com `edges`, `pageInfo`
 * e `totalCount`, e só o `node` de cada edge é um post. Registrar `Page → PostConnection` como
 * mapeamento pediria metadata para um tipo do ORM e para um envelope que não tem classe — muito
 * trabalho para descrever o que o {@link connectionOf} já sabe fazer.
 *
 * Os `pageInfo` continuam saindo dos flags que a página calculou; nada é recalculado aqui. E os nós são
 * traduzidos **de uma vez**, e não um por edge: é o que permite um membro assíncrono existir num
 * `PostView` sem que a página vire N idas ao banco em série.
 */
export function ConnectionInterceptor(
  from?: ModelIdentifier,
  to?: ModelIdentifier,
  options?: { mapperName?: string },
): Type<NestInterceptor> {
  class MixinConnectionInterceptor implements NestInterceptor {
    constructor(
      @InjectMapper(options?.mapperName) private readonly mapper: Mapper,
    ) {}

    intercept(
      _context: ExecutionContext,
      next: CallHandler<Page<any>>,
    ): Observable<ConnectionType<any>> {
      return next.handle().pipe(concatMap(page => this.pageToConnection(page)));
    }

    private async pageToConnection(
      page: Page<any>,
    ): Promise<ConnectionType<any>> {
      if (!from || !to) {
        return connectionOf(page, item => item);
      }
      const nodes = await this.mapper.mapArrayAsync(page.items, from, to);
      const byItem = new Map(
        page.items.map((item, index) => [item, nodes[index]]),
      );
      return connectionOf(page, item => byItem.get(item));
    }
  }

  return mixin(MixinConnectionInterceptor);
}
