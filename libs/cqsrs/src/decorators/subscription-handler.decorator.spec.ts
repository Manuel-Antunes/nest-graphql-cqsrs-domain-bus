import { Scope } from '@nestjs/common';
import { type Observable, EMPTY } from 'rxjs';
import { Subscription } from '../classes/subscription';
import type { ISubscriptionHandler } from '../interfaces/subscription-handler.interface';
import { SUBSCRIPTION_HANDLER_METADATA, SUBSCRIPTION_METADATA } from './constants';
import { SubscriptionHandler } from './subscription-handler.decorator';

describe('@SubscriptionHandler', () => {
  class CounterEvent {}
  const idOf = (subscription: object) => Reflect.getMetadata(SUBSCRIPTION_METADATA, subscription)?.id;

  const INJECTABLE_WATERMARK = '__injectable__';
  const SCOPE_OPTIONS = 'scope:options';

  it('grava na subscription um id, e no handler a subscription que ele trata', () => {
    class OnCounter extends Subscription<CounterEvent> {}

    @SubscriptionHandler(OnCounter)
    class Handler implements ISubscriptionHandler<OnCounter> {
      subscribe(): Observable<CounterEvent> {
        return EMPTY;
      }
    }

    expect(idOf(OnCounter)).toEqual(expect.any(String));
    expect(Reflect.getMetadata(SUBSCRIPTION_HANDLER_METADATA, Handler)).toBe(OnCounter);
  });

  it('o id é gravado uma vez só, e não muda a cada handler decorado', () => {
    class OnCounter extends Subscription<CounterEvent> {}

    @SubscriptionHandler(OnCounter)
    class First implements ISubscriptionHandler<OnCounter> {
      subscribe(): Observable<CounterEvent> {
        return EMPTY;
      }
    }
    const afterFirst = idOf(OnCounter);

    @SubscriptionHandler(OnCounter)
    class Second implements ISubscriptionHandler<OnCounter> {
      subscribe(): Observable<CounterEvent> {
        return EMPTY;
      }
    }

    expect(idOf(OnCounter)).toBe(afterFirst);
    expect(Reflect.getMetadata(SUBSCRIPTION_HANDLER_METADATA, First)).toBe(OnCounter);
    expect(Reflect.getMetadata(SUBSCRIPTION_HANDLER_METADATA, Second)).toBe(OnCounter);
  });

  it('duas subscriptions distintas ganham ids distintos', () => {
    class OnA extends Subscription<CounterEvent> {}
    class OnB extends Subscription<CounterEvent> {}

    @SubscriptionHandler(OnA)
    class HandlerA implements ISubscriptionHandler<OnA> {
      subscribe(): Observable<CounterEvent> {
        return EMPTY;
      }
    }
    @SubscriptionHandler(OnB)
    class HandlerB implements ISubscriptionHandler<OnB> {
      subscribe(): Observable<CounterEvent> {
        return EMPTY;
      }
    }

    expect(idOf(OnA)).not.toBe(idOf(OnB));
    expect(Reflect.getMetadata(SUBSCRIPTION_HANDLER_METADATA, HandlerA)).toBe(OnA);
    expect(Reflect.getMetadata(SUBSCRIPTION_HANDLER_METADATA, HandlerB)).toBe(OnB);
  });

  it('uma subclasse decorada ganha o id dela, e não o do pai', () => {
    class OnBase extends Subscription<CounterEvent> {}
    @SubscriptionHandler(OnBase)
    class BaseHandler implements ISubscriptionHandler<OnBase> {
      subscribe(): Observable<CounterEvent> {
        return EMPTY;
      }
    }
    class OnDerived extends OnBase {}

    @SubscriptionHandler(OnDerived)
    class DerivedHandler implements ISubscriptionHandler<OnDerived> {
      subscribe(): Observable<CounterEvent> {
        return EMPTY;
      }
    }

    expect(idOf(OnDerived)).not.toBe(idOf(OnBase));
    expect(Reflect.getMetadata(SUBSCRIPTION_HANDLER_METADATA, DerivedHandler)).toBe(OnDerived);
    expect(Reflect.getMetadata(SUBSCRIPTION_HANDLER_METADATA, BaseHandler)).toBe(OnBase);
  });

  describe('as opções do @Injectable', () => {
    it('sem opções, o handler não ganha escopo declarado', () => {
      class OnCounter extends Subscription<CounterEvent> {}
      @SubscriptionHandler(OnCounter)
      class Handler implements ISubscriptionHandler<OnCounter> {
        subscribe(): Observable<CounterEvent> {
          return EMPTY;
        }
      }

      expect(Reflect.getMetadata(SCOPE_OPTIONS, Handler)).toBeUndefined();
      expect(Reflect.getMetadata(INJECTABLE_WATERMARK, Handler)).toBeUndefined();
    });

    it('com opções, elas chegam ao @Injectable do handler', () => {
      class OnCounter extends Subscription<CounterEvent> {}
      @SubscriptionHandler(OnCounter, { scope: Scope.REQUEST })
      class Handler implements ISubscriptionHandler<OnCounter> {
        subscribe(): Observable<CounterEvent> {
          return EMPTY;
        }
      }

      expect(Reflect.getMetadata(INJECTABLE_WATERMARK, Handler)).toBe(true);
      expect(Reflect.getMetadata(SCOPE_OPTIONS, Handler)).toEqual({ scope: Scope.REQUEST });
      expect(Reflect.getMetadata(SUBSCRIPTION_HANDLER_METADATA, Handler)).toBe(OnCounter);
    });
  });
});
