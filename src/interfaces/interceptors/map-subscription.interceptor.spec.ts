import type { Mapper, ModelIdentifier } from '@automapper/core';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { MapSubscriptionInterceptor } from './map-subscription.interceptor';

describe('MapSubscriptionInterceptor', () => {
  interface Event {
    readonly n: number;
  }

  const mapperSpy = () => {
    const seen: unknown[] = [];
    const mapper = {
      mapAsync: (source: Event) => {
        seen.push(source);
        return Promise.resolve({ mapped: source.n });
      },
    } as unknown as Mapper;
    return { mapper, seen };
  };

  const intercept = async (stream: AsyncIterable<Event>, mapper: Mapper) => {
    const Interceptor = MapSubscriptionInterceptor(
      {} as ModelIdentifier<Event>,
      {} as never,
    ) as unknown as new (mapper: Mapper) => {
      intercept: (c: ExecutionContext, n: CallHandler) => any;
    };
    const next: CallHandler = { handle: () => of(stream) };
    return (await lastValueFrom(
      new Interceptor(mapper).intercept({} as ExecutionContext, next),
    )) as AsyncIterable<{ mapped: number }>;
  };

  it('traduz cada evento que passa, na ordem em que passou', async () => {
    const { mapper, seen } = mapperSpy();
    async function* source() {
      yield { n: 1 };
      yield { n: 2 };
    }

    const received = [];
    for await (const view of await intercept(source(), mapper)) {
      received.push(view);
    }

    expect(received).toEqual([{ mapped: 1 }, { mapped: 2 }]);
    expect(seen).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it('não puxa nada da fonte antes de alguém consumir', async () => {
    const { mapper } = mapperSpy();
    let pulled = 0;
    async function* source() {
      while (true) {
        pulled += 1;
        yield { n: pulled };
      }
    }

    const mapped = await intercept(source(), mapper);

    expect(pulled).toBe(0);

    const iterator = mapped[Symbol.asyncIterator]();
    await iterator.next();

    expect(pulled).toBe(1);
  });

  it('fechar o stream de fora fecha a fonte', async () => {
    const { mapper } = mapperSpy();
    let closed = false;
    async function* source() {
      try {
        yield { n: 1 };
        yield { n: 2 };
      } finally {
        closed = true;
      }
    }

    for await (const _view of await intercept(source(), mapper)) {
      break;
    }

    expect(closed).toBe(true);
  });

  it('fecha a fonte mesmo com um next() pendente que nunca resolve', async () => {
    const { mapper } = mapperSpy();
    let closed = false;
    const source: AsyncIterable<Event> = {
      [Symbol.asyncIterator]: () => ({
        next: () => new Promise<IteratorResult<Event>>(() => {}),
        return: () => {
          closed = true;
          return Promise.resolve({ value: undefined, done: true } as IteratorResult<Event>);
        },
        [Symbol.asyncIterator]() {
          return this;
        },
      }),
    };

    const iterator = (await intercept(source, mapper))[Symbol.asyncIterator]();
    void iterator.next();
    await iterator.return?.();

    expect(closed).toBe(true);
  });
});
