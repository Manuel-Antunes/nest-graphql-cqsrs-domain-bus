import { Subject, throwError } from 'rxjs';
import { observableToAsyncIterable } from './observable-to-async-iterable';

describe('observableToAsyncIterable', () => {
  it('delivers every value the observable emits, in order, and ends when it completes', async () => {
    const source = new Subject<number>();
    const iterable = observableToAsyncIterable(source);
    const received: number[] = [];

    const consuming = (async () => {
      for await (const value of iterable) {
        received.push(value);
      }
    })();
    source.next(1);
    source.next(2);
    source.complete();
    await consuming;

    expect(received).toEqual([1, 2]);
  });

  it('subscribes on creation and unsubscribes when the consumer returns', async () => {
    const source = new Subject<string>();
    expect(source.observed).toBe(false);

    const iterator = observableToAsyncIterable(source);
    expect(source.observed).toBe(true);

    source.next('a');
    expect(await iterator.next()).toEqual({ value: 'a', done: false });

    await iterator.return?.();

    expect(source.observed).toBe(false);
  });

  it('return() resolves a pending next() right away — it does not wait for the next event', async () => {
    const source = new Subject<number>();
    const iterator = observableToAsyncIterable(source);
    const pending = iterator.next();

    await iterator.return?.();

    expect(await pending).toEqual({ value: undefined, done: true });
    expect(source.observed).toBe(false);
    expect(await iterator.next()).toEqual({ value: undefined, done: true });
  });

  it('is its own iterable, so graphql-js and the filter wrapper see the same subscription', () => {
    const source = new Subject<number>();
    const iterator = observableToAsyncIterable(source);

    expect(iterator[Symbol.asyncIterator]()).toBe(iterator);
    expect(source.observers.length).toBe(1);
  });

  it('propagates the error of the observable to the consumer', async () => {
    const iterator = observableToAsyncIterable(throwError(() => new Error('boom')));

    await expect(iterator.next()).rejects.toThrow('boom');
  });

  it('rejects a pending next() when the observable errors', async () => {
    const source = new Subject<number>();
    const iterator = observableToAsyncIterable(source);
    const pending = iterator.next();

    source.error(new Error('boom'));

    await expect(pending).rejects.toThrow('boom');
    expect(source.observed).toBe(false);
  });

  it('buffers values emitted before the consumer asks for them', async () => {
    const source = new Subject<number>();
    const iterator = observableToAsyncIterable(source);
    source.next(1);
    source.next(2);

    expect((await iterator.next()).value).toBe(1);
    expect((await iterator.next()).value).toBe(2);
  });

  /**
   * `throw()` é a outra porta de saída do protocolo de iterador: um consumidor que aborta com um
   * erro. Como o `return()`, ela precisa cancelar a inscrição **na hora** — senão o assinante fica
   * pendurado no `EventBus` depois de já ter desistido.
   */
  it('throw() cancels the subscription and rejects with the error it was given', async () => {
    const source = new Subject<number>();
    const iterator = observableToAsyncIterable(source);
    expect(source.observed).toBe(true);

    await expect(iterator.throw?.(new Error('abortado'))).rejects.toThrow('abortado');

    expect(source.observed).toBe(false);
    expect(await iterator.next()).toEqual({ value: undefined, done: true });
  });

  it('throw() resolves a pending next() as done instead of leaving it hanging', async () => {
    const source = new Subject<number>();
    const iterator = observableToAsyncIterable(source);
    const pending = iterator.next();

    await expect(iterator.throw?.(new Error('abortado'))).rejects.toThrow('abortado');

    expect(await pending).toEqual({ value: undefined, done: true });
  });

  /** Fechar duas vezes é o caso normal: o graphql-js chama `return()` de um stream já completado. */
  it('closing an already finished iterator is a no-op', async () => {
    const source = new Subject<number>();
    const iterator = observableToAsyncIterable(source);
    source.complete();
    expect(source.observed).toBe(false);

    await iterator.return?.();
    await iterator.return?.();

    expect(await iterator.next()).toEqual({ value: undefined, done: true });
  });

  /** Um valor bufferizado antes do erro ainda é entregue: só depois dele a rejeição aparece. */
  it('delivers what was buffered before the error, then rejects', async () => {
    const source = new Subject<number>();
    const iterator = observableToAsyncIterable(source);
    source.next(1);
    source.error(new Error('boom'));

    expect((await iterator.next()).value).toBe(1);
    await expect(iterator.next()).rejects.toThrow('boom');
  });
});
