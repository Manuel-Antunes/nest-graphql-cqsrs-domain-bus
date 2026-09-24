import type { Mapper, ModelIdentifier } from '@automapper/core';
import { InjectMapper } from '@automapper/nestjs';
import type {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
  Type,
} from '@nestjs/common';
import { mixin } from '@nestjs/common';
import { EventTrace } from '@nestposts/transport-eventbus';
import type { Observable } from 'rxjs';
import { map } from 'rxjs';

export const MapSubscriptionInterceptor = <
  // biome-ignore lint/suspicious/noExplicitAny: it can be in any type
  TSource extends Record<string, any>,
  // biome-ignore lint/suspicious/noExplicitAny: it can be in any type
  TDestination extends Record<string, any>,
>(
  from: ModelIdentifier<TSource>,
  to: ModelIdentifier<TDestination>,
  options?: { mapperName?: string },
): Type<NestInterceptor> => {
  class MixinMapSubscriptionInterceptor implements NestInterceptor {
    constructor(
      @InjectMapper(options?.mapperName) private readonly mapper: Mapper,
    ) {}
    private mapAsyncIterable<A, B>(
      source: AsyncIterable<A>,
      mapOne: (value: A) => B | Promise<B>,
    ): AsyncIterableIterator<B> {
      const iterator = source[Symbol.asyncIterator]();
      const done = (): IteratorResult<B> => ({ value: undefined, done: true });

      return {
        async next(): Promise<IteratorResult<B>> {
          const result = await iterator.next();
          return result.done
            ? done()
            : { value: await mapOne(result.value), done: false };
        },
        async return(): Promise<IteratorResult<B>> {
          await iterator.return?.();
          return done();
        },
        async throw(error: unknown): Promise<IteratorResult<B>> {
          if (iterator.throw) {
            await iterator.throw(error);
          } else {
            await iterator.return?.();
          }
          throw error;
        },
        [Symbol.asyncIterator]() {
          return this;
        },
      };
    }

    intercept(
      _context: ExecutionContext,
      next: CallHandler<AsyncIterable<TSource>>,
    ): Observable<AsyncIterable<TDestination>> {
      const mapper = this.mapper;
      const mapped = (stream: AsyncIterable<TSource>) =>
        this.mapAsyncIterable(stream, async (event) =>
          EventTrace.carry(event, await mapper.mapAsync(event, from, to)),
        );

      return next.handle().pipe(map(mapped));
    }
  }

  return mixin(MixinMapSubscriptionInterceptor);
};
