import { Subject } from 'rxjs';
import { Subscription } from '../classes/subscription';
import type { ISubscriptionBus } from '../interfaces/subscription-bus.interface';
import { subscribeAsAsyncIterable } from './subscribe-as-async-iterable';

/**
 * O helper da camada de interface: pede ao bus, projeta, devolve um async iterable.
 *
 * Ele é a linha inteira de um resolver de subscription, e a razão de existir é o que ele **não** faz:
 * não filtra (o filtro é da mensagem, aplicado pelo bus) e não sabe o que é GraphQL — um async
 * iterable é o contrato de qualquer consumidor *pull*.
 *
 * O que os testes prendem é a passagem de ponta a ponta: a mensagem chega ao bus como veio, cada
 * evento passa pela projeção, e desistir do iterador larga a inscrição no Observable. O último é o
 * que impede um assinante que desconectou de continuar pendurado no `EventBus`.
 */
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
    // Arrange
    const { bus, asked } = fixture();
    const subscription = new OnCounter({ topic: 'a' });

    // Act
    subscribeAsAsyncIterable(bus, subscription);

    // Assert
    expect(asked).toEqual([subscription]);
  });

  it('projeta cada evento para a forma que o assinante recebe', async () => {
    // Arrange
    const { bus, source } = fixture();
    const stream = subscribeAsAsyncIterable(bus, new OnCounter({}), (event) => `#${event.value}`);

    // Act
    const first = stream.next();
    source.next(new CounterEvent(7));

    // Assert
    expect(await first).toEqual({ value: '#7', done: false });
  });

  /** Sem projeção, o evento chega como veio — é o padrão do helper. */
  it('sem projeção, entrega o evento do domínio sem tocá-lo', async () => {
    // Arrange
    const { bus, source } = fixture();
    const stream = subscribeAsAsyncIterable(bus, new OnCounter({}));
    const event = new CounterEvent(1);

    // Act
    const first = stream.next();
    source.next(event);

    // Assert
    expect((await first).value).toBe(event);
  });

  it('mantém a ordem e termina quando a fonte completa', async () => {
    // Arrange
    const { bus, source } = fixture();
    const stream = subscribeAsAsyncIterable(bus, new OnCounter({}), (event) => event.value);

    // Act
    source.next(new CounterEvent(1));
    source.next(new CounterEvent(2));
    source.complete();

    // Assert
    expect((await stream.next()).value).toBe(1);
    expect((await stream.next()).value).toBe(2);
    expect(await stream.next()).toEqual({ value: undefined, done: true });
  });

  /**
   * O ciclo de vida que importa: quando o cliente desconecta, o graphql-js chama `return()` — e a
   * inscrição no Observable precisa cair na hora, não no próximo evento.
   */
  it('desistir do iterador larga a inscrição no stream', async () => {
    // Arrange
    const { bus, source } = fixture();
    const stream = subscribeAsAsyncIterable(bus, new OnCounter({}));
    expect(source.observed).toBe(true);

    // Act
    await stream.return?.();

    // Assert
    expect(source.observed).toBe(false);
  });

  it('é o próprio iterável, então o resolver e um wrapper andam sobre a mesma inscrição', () => {
    // Arrange
    const { bus } = fixture();
    const stream = subscribeAsAsyncIterable(bus, new OnCounter({}));

    // Assert
    expect(stream[Symbol.asyncIterator]()).toBe(stream);
  });
});
