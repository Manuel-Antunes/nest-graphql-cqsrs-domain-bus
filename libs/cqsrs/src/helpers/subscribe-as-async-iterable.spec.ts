import { Subject } from 'rxjs';

import type { ISubscriptionBus } from '../interfaces/subscription-bus.interface';
import { Subscription } from '../classes/subscription';
import { subscribeAsAsyncIterable } from './subscribe-as-async-iterable';

describe('subscribeAsAsyncIterable', () => {
  class CounterEvent {
    constructor(readonly value: number) {}
  }
  class OnCounter extends Subscription<CounterEvent, { topic?: string }> {}

  const fixture = () => {
    const asked: unknown[] = [];
    const source = new Subject<CounterEvent>();
    const bus = {
      subscribe: (subscription: unknown) => {
        asked.push(subscription);
        return source.asObservable();
      },
    } as unknown as ISubscriptionBus;
    return { bus, asked, source };
  };

  it('entrega ao bus a subscription que recebeu, com o critério intacto', () => {
    const { bus, asked } = fixture();
    const subscription = new OnCounter({ topic: 'a' });

    subscribeAsAsyncIterable(bus, subscription);

    expect(asked).toEqual([subscription]);
  });

  it('projeta cada evento para a forma que o assinante recebe', async () => {
    const { bus, source } = fixture();
    const stream = subscribeAsAsyncIterable(
      bus,
      new OnCounter({}),
      (event) => `#${event.value}`,
    );

    const first = stream.next();
    source.next(new CounterEvent(7));

    expect(await first).toEqual({ value: '#7', done: false });
  });

  it('sem projeção, entrega o evento do domínio sem tocá-lo', async () => {
    const { bus, source } = fixture();
    const stream = subscribeAsAsyncIterable(bus, new OnCounter({}));
    const event = new CounterEvent(1);

    const first = stream.next();
    source.next(event);

    expect((await first).value).toBe(event);
  });

  it('mantém a ordem e termina quando a fonte completa', async () => {
    const { bus, source } = fixture();
    const stream = subscribeAsAsyncIterable(
      bus,
      new OnCounter({}),
      (event) => event.value,
    );

    source.next(new CounterEvent(1));
    source.next(new CounterEvent(2));
    source.complete();

    expect((await stream.next()).value).toBe(1);
    expect((await stream.next()).value).toBe(2);
    expect(await stream.next()).toEqual({ value: undefined, done: true });
  });

  it('desistir do iterador larga a inscrição no stream', async () => {
    const { bus, source } = fixture();
    const stream = subscribeAsAsyncIterable(bus, new OnCounter({}));
    expect(source.observed).toBe(true);

    await stream.return?.();

    expect(source.observed).toBe(false);
  });

  it('é o próprio iterável, então o resolver e um wrapper andam sobre a mesma inscrição', () => {
    const { bus } = fixture();
    const stream = subscribeAsAsyncIterable(bus, new OnCounter({}));

    expect(stream[Symbol.asyncIterator]()).toBe(stream);
  });
});
