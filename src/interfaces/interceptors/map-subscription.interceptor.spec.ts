import type { Mapper, ModelIdentifier } from '@automapper/core';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { MapSubscriptionInterceptor } from './map-subscription.interceptor';

/**
 * O embrulho do stream de uma subscription.
 *
 * Os testes que importam aqui não são sobre tradução — são sobre o que um stream precisa continuar
 * sendo depois de embrulhado: **preguiçoso** (nada é puxado antes de alguém pedir) e **cancelável**
 * (sair do consumo fecha a fonte). Perder qualquer um dos dois não quebra teste nenhum de mapeamento:
 * quebra um cliente que desconecta e deixa uma assinatura pendurada no bus.
 */
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
    // Arrange
    const { mapper, seen } = mapperSpy();
    async function* source() {
      yield { n: 1 };
      yield { n: 2 };
    }

    // Act
    const received = [];
    for await (const view of await intercept(source(), mapper)) {
      received.push(view);
    }

    // Assert
    expect(received).toEqual([{ mapped: 1 }, { mapped: 2 }]);
    expect(seen).toEqual([{ n: 1 }, { n: 2 }]);
  });

  /**
   * Abrir a assinatura não pode consumir nada: o `for await` do interceptor só pede o próximo quando
   * quem está do outro lado consumiu o anterior. É a contrapressão que mantém um cliente lento sendo
   * um cliente lento, em vez de um buffer que cresce.
   */
  it('não puxa nada da fonte antes de alguém consumir', async () => {
    // Arrange
    const { mapper } = mapperSpy();
    let pulled = 0;
    async function* source() {
      while (true) {
        pulled += 1;
        yield { n: pulled };
      }
    }

    // Act
    const mapped = await intercept(source(), mapper);

    // Assert
    expect(pulled).toBe(0);

    // Act: um item consumido, um item puxado
    const iterator = mapped[Symbol.asyncIterator]();
    await iterator.next();

    // Assert
    expect(pulled).toBe(1);
  });

  /** Sair do `for await` do consumidor precisa chegar à fonte — senão a assinatura fica pendurada. */
  it('fechar o stream de fora fecha a fonte', async () => {
    // Arrange
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

    // Act
    for await (const _view of await intercept(source(), mapper)) {
      break;
    }

    // Assert
    expect(closed).toBe(true);
  });

  /**
   * **O caso real, e o que um `async function*` não faz** — ver `mapAsyncIterable`. Um cliente que abre
   * a subscription e fecha a aba antes de qualquer evento deixa o embrulho parado num `next()` que
   * pode não resolver nunca; se o cancelamento não alcançar a fonte, a assinatura fica pendurada no
   * `EventBus`. É um vazamento por cliente que desconecta, e nenhum teste que consome um item primeiro
   * o vê.
   */
  it('fecha a fonte mesmo com um next() pendente que nunca resolve', async () => {
    // Arrange: uma fonte que nunca entrega nada, e sabe dizer quando foi fechada
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

    // Act: um next() fica pendente, e o cancelamento chega por cima dele
    const iterator = (await intercept(source, mapper))[Symbol.asyncIterator]();
    void iterator.next();
    await iterator.return?.();

    // Assert
    expect(closed).toBe(true);
  });
});
