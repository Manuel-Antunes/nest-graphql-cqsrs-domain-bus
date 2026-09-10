import { Scope } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { EMPTY } from 'rxjs';
import { Subscription } from '../classes/subscription';
import type { ISubscriptionHandler } from '../interfaces/subscription-handler.interface';
import { SUBSCRIPTION_HANDLER_METADATA, SUBSCRIPTION_METADATA } from './constants';
import { SubscriptionHandler } from './subscription-handler.decorator';

/**
 * O decorator grava metadata em **duas pontas**, e as duas importam por motivos diferentes:
 *
 * - na classe da **subscription**, um `id` — é por ele que o bus roteia, e ele precisa sobreviver a
 *   duas subscriptions com o mesmo nome em módulos diferentes. Daí ser um uuid, e não o nome;
 * - na classe do **handler**, a subscription que ele trata — é o que o `SubscriptionExplorerService`
 *   varre nos providers no bootstrap.
 *
 * O detalhe que o teste do id existe para prender é o `hasOwnMetadata`: o id é gravado **uma vez
 * só**. Se ele fosse regravado a cada decorator, dois handlers da mesma subscription veriam ids
 * diferentes e um deles nunca seria alcançado.
 */
describe('@SubscriptionHandler', () => {
  class CounterEvent {}
  const idOf = (subscription: object) => Reflect.getMetadata(SUBSCRIPTION_METADATA, subscription)?.id;

  /**
   * As chaves que o `@Injectable` do Nest grava. Elas não são exportadas da raiz do `@nestjs/common`
   * (`SCOPE_OPTIONS_METADATA` é interno), então o teste as nomeia — que é justamente o que se quer
   * verificar: que as opções chegaram ao decorator do Nest, e não a um campo nosso.
   */
  const INJECTABLE_WATERMARK = '__injectable__';
  const SCOPE_OPTIONS = 'scope:options';

  it('grava na subscription um id, e no handler a subscription que ele trata', () => {
    // Arrange
    class OnCounter extends Subscription<CounterEvent> {}

    // Act
    @SubscriptionHandler(OnCounter)
    class Handler implements ISubscriptionHandler<OnCounter> {
      subscribe(): Observable<CounterEvent> {
        return EMPTY;
      }
    }

    // Assert
    expect(idOf(OnCounter)).toEqual(expect.any(String));
    expect(Reflect.getMetadata(SUBSCRIPTION_HANDLER_METADATA, Handler)).toBe(OnCounter);
  });

  /**
   * O id é a identidade de roteamento: dois handlers da mesma subscription precisam enxergar o
   * **mesmo** id, senão um dos dois nunca é alcançado pelo bus.
   */
  it('o id é gravado uma vez só, e não muda a cada handler decorado', () => {
    // Arrange
    class OnCounter extends Subscription<CounterEvent> {}

    // Act
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

    // Assert
    expect(idOf(OnCounter)).toBe(afterFirst);
    expect(Reflect.getMetadata(SUBSCRIPTION_HANDLER_METADATA, First)).toBe(OnCounter);
    expect(Reflect.getMetadata(SUBSCRIPTION_HANDLER_METADATA, Second)).toBe(OnCounter);
  });

  /** Nomes iguais em módulos diferentes são subscriptions diferentes — o uuid é o que garante isso. */
  it('duas subscriptions distintas ganham ids distintos', () => {
    // Arrange / Act
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

    // Assert
    expect(idOf(OnA)).not.toBe(idOf(OnB));
    expect(Reflect.getMetadata(SUBSCRIPTION_HANDLER_METADATA, HandlerA)).toBe(OnA);
    expect(Reflect.getMetadata(SUBSCRIPTION_HANDLER_METADATA, HandlerB)).toBe(OnB);
  });

  /**
   * Uma subclasse de uma subscription já decorada não pode **herdar** o id do pai: se herdasse, o bus
   * as trataria como a mesma mensagem. `hasOwnMetadata` é o que separa as duas.
   */
  it('uma subclasse decorada ganha o id dela, e não o do pai', () => {
    // Arrange
    class OnBase extends Subscription<CounterEvent> {}
    @SubscriptionHandler(OnBase)
    class BaseHandler implements ISubscriptionHandler<OnBase> {
      subscribe(): Observable<CounterEvent> {
        return EMPTY;
      }
    }
    class OnDerived extends OnBase {}

    // Act
    @SubscriptionHandler(OnDerived)
    class DerivedHandler implements ISubscriptionHandler<OnDerived> {
      subscribe(): Observable<CounterEvent> {
        return EMPTY;
      }
    }

    // Assert
    expect(idOf(OnDerived)).not.toBe(idOf(OnBase));
    expect(Reflect.getMetadata(SUBSCRIPTION_HANDLER_METADATA, DerivedHandler)).toBe(OnDerived);
    expect(Reflect.getMetadata(SUBSCRIPTION_HANDLER_METADATA, BaseHandler)).toBe(OnBase);
  });

  describe('as opções do @Injectable', () => {
    it('sem opções, o handler não ganha escopo declarado', () => {
      // Arrange / Act
      class OnCounter extends Subscription<CounterEvent> {}
      @SubscriptionHandler(OnCounter)
      class Handler implements ISubscriptionHandler<OnCounter> {
        subscribe(): Observable<CounterEvent> {
          return EMPTY;
        }
      }

      // Assert
      expect(Reflect.getMetadata(SCOPE_OPTIONS, Handler)).toBeUndefined();
      expect(Reflect.getMetadata(INJECTABLE_WATERMARK, Handler)).toBeUndefined();
    });

    /** É o que permite um handler request-scoped — o caminho que o `SubscriptionBus.bind` bifurca. */
    it('com opções, elas chegam ao @Injectable do handler', () => {
      // Arrange / Act
      class OnCounter extends Subscription<CounterEvent> {}
      @SubscriptionHandler(OnCounter, { scope: Scope.REQUEST })
      class Handler implements ISubscriptionHandler<OnCounter> {
        subscribe(): Observable<CounterEvent> {
          return EMPTY;
        }
      }

      // Assert
      expect(Reflect.getMetadata(INJECTABLE_WATERMARK, Handler)).toBe(true);
      expect(Reflect.getMetadata(SCOPE_OPTIONS, Handler)).toEqual({ scope: Scope.REQUEST });
      expect(Reflect.getMetadata(SUBSCRIPTION_HANDLER_METADATA, Handler)).toBe(OnCounter);
    });
  });
});
