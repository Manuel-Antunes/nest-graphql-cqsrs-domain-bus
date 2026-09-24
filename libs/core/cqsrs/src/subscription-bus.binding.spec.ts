import type { ModuleRef } from '@nestjs/core';
import type { InstanceWrapper } from '@nestjs/core/injector/instance-wrapper';
import { AsyncContext } from '@nestjs/cqrs';
import { Observable, of, Subject } from 'rxjs';

import { Subscription } from './classes/subscription';
import {
  SUBSCRIPTION_HANDLER_METADATA,
  SUBSCRIPTION_METADATA,
} from './decorators/constants';
import { SubscriptionHandler } from './decorators/subscription-handler.decorator';
import {
  InvalidSubscriptionHandlerException,
  SubscriptionHandlerNotFoundException,
} from './exceptions/index';
import type {
  ISubscriptionHandler,
  ISubscriptionPublisher,
} from './interfaces/index';
import { SubscriptionBus } from './subscription-bus';

describe('SubscriptionBus: registro e ligação', () => {
  class CounterEvent {
    constructor(readonly value: number) {}
  }

  class OnCounter extends Subscription<CounterEvent, { topic?: string }> {}

  @SubscriptionHandler(OnCounter)
  class OnCounterHandler implements ISubscriptionHandler<OnCounter> {
    subscribe(): Observable<CounterEvent> {
      return of(new CounterEvent(1));
    }
  }

  class Unhandled extends Subscription<CounterEvent> {}

  const moduleRefStub = () =>
    ({
      registerRequestByContextId: vi.fn(),
      resolve: vi.fn(),
    }) as unknown as ModuleRef & {
      registerRequestByContextId: any;
      resolve: any;
    };

  const staticWrapper = (metatype: any, instance: unknown) =>
    ({
      isDependencyTreeStatic: () => true,
      metatype,
      instance,
    }) as unknown as InstanceWrapper<ISubscriptionHandler<any>>;

  const scopedWrapper = (metatype: any) =>
    ({
      isDependencyTreeStatic: () => false,
      metatype,
      instance: undefined,
    }) as unknown as InstanceWrapper<ISubscriptionHandler<any>>;

  describe('register', () => {
    it('liga o handler anotado, e a subscription passa a ter rota', () => {
      const bus = new SubscriptionBus(moduleRefStub());

      bus.register([staticWrapper(OnCounterHandler, new OnCounterHandler())]);

      expect(() => bus.subscribe(new OnCounter({}))).not.toThrow();
    });

    it('recusa um provider que não está anotado', () => {
      const bus = new SubscriptionBus(moduleRefStub());
      class NotAHandler {}

      expect(() =>
        bus.register([staticWrapper(NotAHandler, new NotAHandler())]),
      ).toThrow(InvalidSubscriptionHandlerException);
    });

    it('recusa uma classe anotada que não tem subscribe', () => {
      const bus = new SubscriptionBus(moduleRefStub());
      @SubscriptionHandler(OnCounter)
      class Broken {}

      expect(() => bus.register([staticWrapper(Broken, new Broken())])).toThrow(
        InvalidSubscriptionHandlerException,
      );
    });

    it('registrar dois handlers para a mesma subscription avisa e fica com o último', () => {
      const bus = new SubscriptionBus(moduleRefStub());
      const warn = vi
        .spyOn((bus as any).logger, 'warn')
        .mockImplementation(() => undefined);
      class Segundo implements ISubscriptionHandler<OnCounter> {
        subscribe(): Observable<CounterEvent> {
          return of(new CounterEvent(99));
        }
      }
      Reflect.defineMetadata(SUBSCRIPTION_HANDLER_METADATA, OnCounter, Segundo);

      bus.register([staticWrapper(OnCounterHandler, new OnCounterHandler())]);
      bus.register([staticWrapper(Segundo, new Segundo())]);

      expect(warn).toHaveBeenCalledOnce();
      expect(warn.mock.calls[0][0]).toMatch(/already registered/);
      const received: number[] = [];
      bus
        .subscribe<CounterEvent>(new OnCounter({}))
        .subscribe((event) => received.push(event.value));
      expect(received).toEqual([99]);

      warn.mockRestore();
    });

    it('aceita um handler que veio de factory provider, lendo a classe da instância', () => {
      const bus = new SubscriptionBus(moduleRefStub());
      const wrapper = {
        isDependencyTreeStatic: () => true,
        inject: [],
        metatype: undefined,
        instance: new OnCounterHandler(),
      } as unknown as InstanceWrapper<ISubscriptionHandler<any>>;

      bus.register([wrapper]);

      expect(() => bus.subscribe(new OnCounter({}))).not.toThrow();
    });

    it('register sem argumento nenhum é um no-op', () => {
      const bus = new SubscriptionBus(moduleRefStub());

      expect(() => bus.register()).not.toThrow();
    });
  });

  describe('subscribe sem rota', () => {
    it('uma subscription sem metadata nenhuma é recusada pelo nome da classe', () => {
      const bus = new SubscriptionBus(moduleRefStub());

      expect(() => bus.subscribe(new Unhandled())).toThrow(
        SubscriptionHandlerNotFoundException,
      );
      expect(() => bus.subscribe(new Unhandled())).toThrow(/Unhandled/);
    });

    it('uma subscription com id mas sem handler registrado é recusada pelo nome', () => {
      const bus = new SubscriptionBus(moduleRefStub());

      expect(() => bus.subscribe(new OnCounter({}))).toThrow(
        SubscriptionHandlerNotFoundException,
      );
      expect(() => bus.subscribe(new OnCounter({}))).toThrow(/OnCounter/);
    });
  });

  describe('handler request-scoped', () => {
    it('resolve a instância a cada assinatura, no contexto do pedido', async () => {
      const moduleRef = moduleRefStub();
      const source = new Subject<CounterEvent>();
      const resolved = { subscribe: () => source.asObservable() };
      moduleRef.resolve.mockResolvedValue(resolved);
      const bus = new SubscriptionBus(moduleRef);
      bus.register([scopedWrapper(OnCounterHandler)]);

      const received: number[] = [];
      bus
        .subscribe<CounterEvent>(new OnCounter({ topic: 'a' }))
        .subscribe((event) => received.push(event.value));
      await Promise.resolve();
      source.next(new CounterEvent(3));

      expect(moduleRef.registerRequestByContextId).toHaveBeenCalledOnce();
      expect(moduleRef.resolve).toHaveBeenCalledWith(
        OnCounterHandler,
        expect.anything(),
        { strict: false },
      );
      expect(received).toEqual([3]);
    });

    it('quando quem assina traz um AsyncContext, é ele que vale', async () => {
      const moduleRef = moduleRefStub();
      moduleRef.resolve.mockResolvedValue({
        subscribe: () => of(new CounterEvent(1)),
      });
      const bus = new SubscriptionBus(moduleRef);
      bus.register([scopedWrapper(OnCounterHandler)]);
      const context = new AsyncContext();

      bus.subscribe(new OnCounter({ topic: 'b' }), context).subscribe();
      await Promise.resolve();

      expect(moduleRef.registerRequestByContextId).toHaveBeenCalledWith(
        context,
        context.id,
      );
      expect(moduleRef.resolve).toHaveBeenCalledWith(
        OnCounterHandler,
        context.id,
        { strict: false },
      );
    });
  });

  describe('o publisher', () => {
    it('o padrão anuncia cada pedido em subscriptions$', () => {
      const bus = new SubscriptionBus(moduleRefStub());
      bus.register([staticWrapper(OnCounterHandler, new OnCounterHandler())]);
      const asked: unknown[] = [];
      bus.subscriptions$.subscribe((subscription) => asked.push(subscription));
      const pedido = new OnCounter({ topic: 'x' });

      bus.subscribe(pedido);

      expect(asked).toEqual([pedido]);
    });

    it('pode ser trocado, e o novo passa a receber os pedidos', () => {
      const bus = new SubscriptionBus(moduleRefStub());
      bus.register([staticWrapper(OnCounterHandler, new OnCounterHandler())]);
      const published: unknown[] = [];
      const custom: ISubscriptionPublisher<any> = {
        publish: (subscription) => published.push(subscription),
      };

      bus.publisher = custom;
      const pedido = new OnCounter({ topic: 'y' });
      bus.subscribe(pedido);

      expect(bus.publisher).toBe(custom);
      expect(published).toEqual([pedido]);
    });

    it('as opções do módulo podem instalar o publisher desde o começo', () => {
      const published: unknown[] = [];
      const custom: ISubscriptionPublisher<any> = {
        publish: (subscription) => published.push(subscription),
      };
      const bus = new SubscriptionBus(moduleRefStub(), {
        subscriptionPublisher: custom,
      });
      bus.register([staticWrapper(OnCounterHandler, new OnCounterHandler())]);

      bus.subscribe(new OnCounter({ topic: 'z' }));

      expect(bus.publisher).toBe(custom);
      expect(published).toHaveLength(1);
    });
  });

  describe('uma mensagem que não estende Subscription', () => {
    class BareMessage {
      constructor(readonly criteria: { topic?: string } = {}) {}
    }
    Reflect.defineMetadata(
      SUBSCRIPTION_METADATA,
      { id: 'bare-message-id' },
      BareMessage,
    );

    const busWithBareHandler = () => {
      const bus = new SubscriptionBus(moduleRefStub());
      const source = new Subject<CounterEvent>();
      class BareHandler {
        subscribe(): Observable<CounterEvent> {
          return source.asObservable();
        }
      }
      Reflect.defineMetadata(
        SUBSCRIPTION_HANDLER_METADATA,
        BareMessage,
        BareHandler,
      );
      bus.register([staticWrapper(BareHandler, new BareHandler())]);
      return { bus, source };
    };

    it('sem match, o stream entrega tudo o que a fonte emitir', () => {
      const { bus, source } = busWithBareHandler();
      const received: number[] = [];

      bus
        .subscribe<CounterEvent>(new BareMessage() as any)
        .subscribe((event) => received.push(event.value));
      source.next(new CounterEvent(1));
      source.next(new CounterEvent(2));

      expect(received).toEqual([1, 2]);
    });

    it('sem key, a chave sai do critério — mesmo critério, mesmo stream', () => {
      const { bus } = busWithBareHandler();

      const first = bus.subscribe(new BareMessage({ topic: 'a' }) as any);
      const igual = bus.subscribe(new BareMessage({ topic: 'a' }) as any);
      const outro = bus.subscribe(new BareMessage({ topic: 'b' }) as any);

      expect(igual).toBe(first);
      expect(outro).not.toBe(first);
    });
  });
});
