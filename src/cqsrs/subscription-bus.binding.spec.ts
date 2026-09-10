import type { ModuleRef } from '@nestjs/core';
import type { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { AsyncContext } from '@nestjs/cqrs';
import { Observable, of, Subject } from 'rxjs';
import { Subscription } from './classes/subscription';
import { SUBSCRIPTION_HANDLER_METADATA, SUBSCRIPTION_METADATA } from './decorators/constants';
import { SubscriptionHandler } from './decorators/subscription-handler.decorator';
import {
  InvalidSubscriptionHandlerException,
  SubscriptionHandlerNotFoundException,
} from './exceptions';
import type { ISubscriptionHandler, ISubscriptionPublisher } from './interfaces';
import { SubscriptionBus } from './subscription-bus';

/**
 * O bus por dentro: **registro e ligação**, sem o container do Nest no meio.
 *
 * O `subscription-bus.spec` cobre o bus como ele é usado — módulo de verdade, `EventBus` de verdade,
 * streams compartilhados por chave. O que fica de fora de lá é tudo o que acontece **no bootstrap**,
 * e é onde moram as falhas mais caras: um handler mal formado, dois handlers para a mesma
 * subscription, um handler request-scoped resolvido a cada assinatura. Nenhuma delas aparece num
 * teste feliz — a subscription simplesmente não chega, ou chega no contexto errado.
 *
 * Os `InstanceWrapper` daqui são feitos à mão de propósito: o que o `bind` lê deles são duas coisas
 * (`isDependencyTreeStatic()` e `metatype`/`instance`), e escrevê-las explicitamente é o que torna a
 * bifurcação visível no teste.
 */
describe('SubscriptionBus: registro e ligação', () => {
  class CounterEvent {
    constructor(readonly value: number) {}
  }

  class OnCounter extends Subscription<CounterEvent, { topic?: string }> {}

  /** Só decorar já grava o id na classe da subscription — é o que o bus usa para rotear. */
  @SubscriptionHandler(OnCounter)
  class OnCounterHandler implements ISubscriptionHandler<OnCounter> {
    subscribe(): Observable<CounterEvent> {
      return of(new CounterEvent(1));
    }
  }

  /** Uma subscription que nenhum `@SubscriptionHandler` menciona: nem metadata ela tem. */
  class Unhandled extends Subscription<CounterEvent> {}

  const moduleRefStub = () =>
    ({
      registerRequestByContextId: vi.fn(),
      resolve: vi.fn(),
    }) as unknown as ModuleRef & { registerRequestByContextId: any; resolve: any };

  /** Um wrapper estático, como o explorer devolve para um provider comum. */
  const staticWrapper = (metatype: any, instance: unknown) =>
    ({
      isDependencyTreeStatic: () => true,
      metatype,
      instance,
    }) as unknown as InstanceWrapper<ISubscriptionHandler<any>>;

  /** Um wrapper request-scoped: a instância só existe dentro de um contexto. */
  const scopedWrapper = (metatype: any) =>
    ({
      isDependencyTreeStatic: () => false,
      metatype,
      instance: undefined,
    }) as unknown as InstanceWrapper<ISubscriptionHandler<any>>;

  describe('register', () => {
    it('liga o handler anotado, e a subscription passa a ter rota', () => {
      // Arrange
      const bus = new SubscriptionBus(moduleRefStub());

      // Act
      bus.register([staticWrapper(OnCounterHandler, new OnCounterHandler())]);

      // Assert
      expect(() => bus.subscribe(new OnCounter({}))).not.toThrow();
    });

    /**
     * Um provider sem `@SubscriptionHandler` chegando ao `register` é erro de configuração, e o bus
     * recusa em vez de registrar uma rota para lugar nenhum.
     */
    it('recusa um provider que não está anotado', () => {
      // Arrange
      const bus = new SubscriptionBus(moduleRefStub());
      class NotAHandler {}

      // Act / Assert
      expect(() => bus.register([staticWrapper(NotAHandler, new NotAHandler())])).toThrow(
        InvalidSubscriptionHandlerException,
      );
    });

    /**
     * Uma classe anotada precisa **ser** um handler. Sem `subscribe`, o bus recusaria só na hora da
     * primeira assinatura — em produção, com o cliente já conectado. Aqui ele recusa no bootstrap.
     */
    it('recusa uma classe anotada que não tem subscribe', () => {
      // Arrange
      const bus = new SubscriptionBus(moduleRefStub());
      @SubscriptionHandler(OnCounter)
      class Broken {}

      // Act / Assert
      expect(() => bus.register([staticWrapper(Broken, new Broken())])).toThrow(
        InvalidSubscriptionHandlerException,
      );
    });

    it('registrar dois handlers para a mesma subscription avisa e fica com o último', () => {
      // Arrange
      const bus = new SubscriptionBus(moduleRefStub());
      const warn = vi.spyOn((bus as any).logger, 'warn').mockImplementation(() => undefined);
      class Segundo implements ISubscriptionHandler<OnCounter> {
        subscribe(): Observable<CounterEvent> {
          return of(new CounterEvent(99));
        }
      }
      Reflect.defineMetadata(SUBSCRIPTION_HANDLER_METADATA, OnCounter, Segundo);

      // Act
      bus.register([staticWrapper(OnCounterHandler, new OnCounterHandler())]);
      bus.register([staticWrapper(Segundo, new Segundo())]);

      // Assert
      expect(warn).toHaveBeenCalledOnce();
      expect(warn.mock.calls[0][0]).toMatch(/already registered/);
      const received: number[] = [];
      bus.subscribe<CounterEvent>(new OnCounter({})).subscribe((event) => received.push(event.value));
      expect(received).toEqual([99]);

      warn.mockRestore();
    });

    /** O caso do factory provider: sem `metatype`, a classe vem do construtor da instância. */
    it('aceita um handler que veio de factory provider, lendo a classe da instância', () => {
      // Arrange
      const bus = new SubscriptionBus(moduleRefStub());
      const wrapper = {
        isDependencyTreeStatic: () => true,
        inject: [],
        metatype: undefined,
        instance: new OnCounterHandler(),
      } as unknown as InstanceWrapper<ISubscriptionHandler<any>>;

      // Act
      bus.register([wrapper]);

      // Assert
      expect(() => bus.subscribe(new OnCounter({}))).not.toThrow();
    });

    it('register sem argumento nenhum é um no-op', () => {
      // Arrange
      const bus = new SubscriptionBus(moduleRefStub());

      // Act / Assert
      expect(() => bus.register()).not.toThrow();
    });
  });

  describe('subscribe sem rota', () => {
    it('uma subscription sem metadata nenhuma é recusada pelo nome da classe', () => {
      // Arrange
      const bus = new SubscriptionBus(moduleRefStub());

      // Act / Assert
      expect(() => bus.subscribe(new Unhandled())).toThrow(SubscriptionHandlerNotFoundException);
      expect(() => bus.subscribe(new Unhandled())).toThrow(/Unhandled/);
    });

    /**
     * O caso mais traiçoeiro: a subscription **tem** id (alguém decorou um handler para ela), mas o
     * provider desse handler não entrou no módulo. O bus tem a metadata e não tem a rota — e a
     * mensagem precisa nomear a subscription, não o id opaco.
     */
    it('uma subscription com id mas sem handler registrado é recusada pelo nome', () => {
      // Arrange — o handler foi decorado (logo, OnCounter tem id), mas nunca registrado no bus
      const bus = new SubscriptionBus(moduleRefStub());

      // Act / Assert
      expect(() => bus.subscribe(new OnCounter({}))).toThrow(SubscriptionHandlerNotFoundException);
      expect(() => bus.subscribe(new OnCounter({}))).toThrow(/OnCounter/);
    });
  });

  describe('handler request-scoped', () => {
    /**
     * A outra metade do `bind`: sem árvore de dependências estática, a instância não existe no
     * bootstrap. Ela é resolvida **a cada assinatura**, dentro do `defer`, no contexto daquele
     * pedido — que é o que dá sentido a um handler request-scoped.
     */
    it('resolve a instância a cada assinatura, no contexto do pedido', async () => {
      // Arrange
      const moduleRef = moduleRefStub();
      const source = new Subject<CounterEvent>();
      const resolved = { subscribe: () => source.asObservable() };
      moduleRef.resolve.mockResolvedValue(resolved);
      const bus = new SubscriptionBus(moduleRef);
      bus.register([scopedWrapper(OnCounterHandler)]);

      // Act
      const received: number[] = [];
      bus.subscribe<CounterEvent>(new OnCounter({ topic: 'a' })).subscribe((event) => received.push(event.value));
      await Promise.resolve();
      source.next(new CounterEvent(3));

      // Assert
      expect(moduleRef.registerRequestByContextId).toHaveBeenCalledOnce();
      expect(moduleRef.resolve).toHaveBeenCalledWith(OnCounterHandler, expect.anything(), { strict: false });
      expect(received).toEqual([3]);
    });

    it('quando quem assina traz um AsyncContext, é ele que vale', async () => {
      // Arrange
      const moduleRef = moduleRefStub();
      moduleRef.resolve.mockResolvedValue({ subscribe: () => of(new CounterEvent(1)) });
      const bus = new SubscriptionBus(moduleRef);
      bus.register([scopedWrapper(OnCounterHandler)]);
      const context = new AsyncContext();

      // Act
      bus.subscribe(new OnCounter({ topic: 'b' }), context).subscribe();
      await Promise.resolve();

      // Assert
      expect(moduleRef.registerRequestByContextId).toHaveBeenCalledWith(context, context.id);
      expect(moduleRef.resolve).toHaveBeenCalledWith(OnCounterHandler, context.id, { strict: false });
    });
  });

  describe('o publisher', () => {
    it('o padrão anuncia cada pedido em subscriptions$', () => {
      // Arrange
      const bus = new SubscriptionBus(moduleRefStub());
      bus.register([staticWrapper(OnCounterHandler, new OnCounterHandler())]);
      const asked: unknown[] = [];
      bus.subscriptions$.subscribe((subscription) => asked.push(subscription));
      const pedido = new OnCounter({ topic: 'x' });

      // Act
      bus.subscribe(pedido);

      // Assert
      expect(asked).toEqual([pedido]);
    });

    it('pode ser trocado, e o novo passa a receber os pedidos', () => {
      // Arrange
      const bus = new SubscriptionBus(moduleRefStub());
      bus.register([staticWrapper(OnCounterHandler, new OnCounterHandler())]);
      const published: unknown[] = [];
      const custom: ISubscriptionPublisher<any> = { publish: (subscription) => published.push(subscription) };

      // Act
      bus.publisher = custom;
      const pedido = new OnCounter({ topic: 'y' });
      bus.subscribe(pedido);

      // Assert
      expect(bus.publisher).toBe(custom);
      expect(published).toEqual([pedido]);
    });

    /** O publisher também entra pelas opções do módulo — o mesmo efeito, decidido no bootstrap. */
    it('as opções do módulo podem instalar o publisher desde o começo', () => {
      // Arrange
      const published: unknown[] = [];
      const custom: ISubscriptionPublisher<any> = { publish: (subscription) => published.push(subscription) };
      const bus = new SubscriptionBus(moduleRefStub(), { subscriptionPublisher: custom });
      bus.register([staticWrapper(OnCounterHandler, new OnCounterHandler())]);

      // Act
      bus.subscribe(new OnCounter({ topic: 'z' }));

      // Assert
      expect(bus.publisher).toBe(custom);
      expect(published).toHaveLength(1);
    });
  });

  /**
   * O bus aceita qualquer coisa que implemente `ISubscription`, e nem toda mensagem é uma
   * `Subscription`. Sem `match`, o stream não filtra nada; sem `key`, a chave cai no critério
   * serializado — e, sem critério nenhum, todas as instâncias dividem um stream só.
   */
  describe('uma mensagem que não estende Subscription', () => {
    /**
     * Um `ISubscription` cru: sem `match` e sem `key`. A metadata do id é escrita à mão porque não há
     * decorator envolvido — é exatamente o cenário de quem implementa a interface sem herdar a classe.
     */
    class BareMessage {
      constructor(readonly criteria: { topic?: string } = {}) {}
    }
    Reflect.defineMetadata(SUBSCRIPTION_METADATA, { id: 'bare-message-id' }, BareMessage);

    const busWithBareHandler = () => {
      const bus = new SubscriptionBus(moduleRefStub());
      const source = new Subject<CounterEvent>();
      class BareHandler {
        subscribe(): Observable<CounterEvent> {
          return source.asObservable();
        }
      }
      Reflect.defineMetadata(SUBSCRIPTION_HANDLER_METADATA, BareMessage, BareHandler);
      bus.register([staticWrapper(BareHandler, new BareHandler())]);
      return { bus, source };
    };

    it('sem match, o stream entrega tudo o que a fonte emitir', () => {
      // Arrange
      const { bus, source } = busWithBareHandler();
      const received: number[] = [];

      // Act
      bus.subscribe<CounterEvent>(new BareMessage() as any).subscribe((event) => received.push(event.value));
      source.next(new CounterEvent(1));
      source.next(new CounterEvent(2));

      // Assert
      expect(received).toEqual([1, 2]);
    });

    it('sem key, a chave sai do critério — mesmo critério, mesmo stream', () => {
      // Arrange
      const { bus } = busWithBareHandler();

      // Act
      const first = bus.subscribe(new BareMessage({ topic: 'a' }) as any);
      const igual = bus.subscribe(new BareMessage({ topic: 'a' }) as any);
      const outro = bus.subscribe(new BareMessage({ topic: 'b' }) as any);

      // Assert
      expect(igual).toBe(first);
      expect(outro).not.toBe(first);
    });
  });
});
