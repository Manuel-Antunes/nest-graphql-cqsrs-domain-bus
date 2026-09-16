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

export function ConnectionInterceptor(): Type<NestInterceptor>;
export function ConnectionInterceptor<
  TSource extends Record<string, any>,
  TDestination extends Record<string, any>,
>(
  from: ModelIdentifier<TSource>,
  to: ModelIdentifier<TDestination>,
  options?: { mapperName?: string },
): Type<NestInterceptor>;

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
