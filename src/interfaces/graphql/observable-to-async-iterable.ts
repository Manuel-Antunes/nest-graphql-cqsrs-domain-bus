import type { Observable, Subscription } from 'rxjs';

/**
 * `Observable<T>` → `AsyncIterableIterator<T>`: a ponte entre o RxJS (o que o `EventBus` do
 * @nestjs/cqrs fala) e o graphql-js (que consome uma subscription como *async iterator*). O único
 * "helper" do projeto.
 *
 * ## Por que não um `ReadableStream`, um `Readable` ou um `async function*`
 * Todos os três são async-iteráveis por natureza, mas **serializam `return()` atrás de um `next()`
 * pendente**: uma subscription GraphQL passa a vida inteira esperando o próximo evento, e quando o
 * cliente desconecta o graphql-js chama `return()` — que só resolveria quando o próximo evento
 * chegasse. Até lá, o assinante continuaria vivo no `EventBus`. Um iterador com fila explícita não
 * tem esse problema: `return()` resolve os `next()` pendentes com `done: true` na hora e cancela a
 * inscrição no Observable. É a mesma mecânica do `PubSubAsyncIterableIterator` do
 * `graphql-subscriptions`, só que ligada a um Observable em vez de a um PubSub.
 *
 * ## Ciclo de vida
 * - a inscrição no Observable acontece aqui, na criação — o resolver de subscription é chamado uma
 *   vez por assinante GraphQL, então cada assinante é exatamente um assinante do `EventBus`;
 * - `next`/`error`/`complete` do Observable alimentam a fila (ou atendem um `next()` que já espera);
 * - `return()` (cliente desconectou) e `throw()` cancelam a inscrição. Nada vaza.
 *
 * É um *iterator* que também é *iterable* (`[Symbol.asyncIterator]` devolve ele mesmo), porque o
 * `filter` do @nestjs/graphql chama `next()` direto no que o resolver devolveu, enquanto o graphql-js
 * sem filtro pede o `[Symbol.asyncIterator]()`.
 *
 * Não há backpressure de verdade (o `EventBus` é push; a fila cresce), o mesmo contrato do PubSub em
 * memória — e o suficiente para uma POC.
 */
export function observableToAsyncIterable<T>(source: Observable<T>): AsyncIterableIterator<T> {
  /** Valores emitidos que ninguém pediu ainda. */
  const buffered: T[] = [];
  /** `next()` chamados que ainda não têm valor para devolver. */
  const waiting: Array<{ resolve: (result: IteratorResult<T>) => void; reject: (error: unknown) => void }> = [];
  let finished = false;
  let failure: { error: unknown } | undefined;
  /** `let`, e não `const`: um Observable pode errar ou completar de forma síncrona, ainda dentro do `subscribe`. */
  let subscription: Subscription | undefined;
  const done = (): IteratorResult<T> => ({ value: undefined, done: true });

  const finish = () => {
    if (finished) {
      return;
    }
    finished = true;
    subscription?.unsubscribe();
    for (const pending of waiting.splice(0)) {
      failure ? pending.reject(failure.error) : pending.resolve(done());
    }
  };

  subscription = source.subscribe({
    next: (value) => (waiting.length ? waiting.shift()!.resolve({ value, done: false }) : buffered.push(value)),
    error: (error) => {
      failure = { error };
      finish();
    },
    complete: finish,
  });

  return {
    next: () => {
      if (buffered.length) {
        return Promise.resolve({ value: buffered.shift()!, done: false });
      }
      if (failure) {
        return Promise.reject(failure.error);
      }
      if (finished) {
        return Promise.resolve(done());
      }
      return new Promise((resolve, reject) => waiting.push({ resolve, reject }));
    },
    return: () => {
      finish();
      return Promise.resolve(done());
    },
    throw: (error) => {
      finish();
      return Promise.reject(error);
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };
}
