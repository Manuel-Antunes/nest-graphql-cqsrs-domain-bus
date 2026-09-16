import type { Mapper, ModelIdentifier } from "@automapper/core";
import { InjectMapper } from "@automapper/nestjs";
import {
  mixin,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
  type Type,
} from "@nestjs/common";
import { map, type Observable } from "rxjs";

/**
 * O `MapInterceptor` para quem devolve um **stream**: o resolver entrega os eventos de domínio como
 * eles saem do `SubscriptionBus`, e cada um é traduzido na saída.
 *
 * O da lib não serve porque um `@Subscription` não devolve um valor: devolve um `AsyncIterable` que
 * vive enquanto o cliente estiver conectado. Ele mapearia **o iterável** — o objeto, uma vez, na hora
 * de abrir —, e o cliente ficaria assinando um stream que nunca entrega nada. Este aqui não mapeia a
 * resposta: ele a **embrulha** (ver {@link mapAsyncIterable}).
 */
export const MapSubscriptionInterceptor = <
  TSource extends Record<string, any>,
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
        this.mapAsyncIterable(stream, event =>
          mapper.mapAsync(event, from, to),
        );

      return next.handle().pipe(map(mapped));
    }
  }

  return mixin(MixinMapSubscriptionInterceptor);
};

/**
 * `AsyncIterable<A>` → `AsyncIterable<B>`, item a item, **repassando o cancelamento na hora**.
 *
 * ## Por que não é um `async function*`
 * Porque um gerador não pode ser cancelado enquanto está esperando, e o caso real é exatamente esse:
 * um cliente que abre a subscription e fecha a aba sem que nenhum evento tenha passado. Aí o gerador
 * está suspenso no `await` do primeiro evento — que pode não vir nunca —, e um `return()` vindo de
 * fora entra na **fila** dele em vez de interrompê-lo. O `for await` nunca sai, a fonte nunca é
 * fechada, e a assinatura fica pendurada no `EventBus`: um vazamento por cliente que desconecta,
 * invisível para qualquer teste que consuma um item primeiro.
 *
 * É a mesma razão pela qual o graphql-js escreve o `mapAsyncIterator` dele à mão.
 */
