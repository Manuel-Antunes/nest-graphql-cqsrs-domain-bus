import type { Observable } from 'rxjs';
import { Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { EMPTY } from 'rxjs';

import type { ISubscriptionHandler } from '../interfaces/subscription-handler.interface';
import { Subscription } from '../classes/subscription';
import { SubscriptionHandler } from '../decorators/subscription-handler.decorator';
import { SubscriptionExplorerService } from './subscription-explorer.service';

describe('SubscriptionExplorerService', () => {
  class CounterEvent {}
  class OnCounter extends Subscription<CounterEvent> {}
  class OnOther extends Subscription<CounterEvent> {}

  @SubscriptionHandler(OnCounter)
  class AnnotatedHandler implements ISubscriptionHandler<OnCounter> {
    subscribe(): Observable<CounterEvent> {
      return EMPTY;
    }
  }

  @SubscriptionHandler(OnOther)
  class FactoryBuiltHandler implements ISubscriptionHandler<OnOther> {
    subscribe(): Observable<CounterEvent> {
      return EMPTY;
    }
  }

  @Injectable()
  class PlainProvider {}

  const explore = async (providers: any[]) => {
    const module = await Test.createTestingModule({
      providers: [SubscriptionExplorerService, ...providers],
    }).compile();
    await module.init();
    const found = module.get(SubscriptionExplorerService).explore();
    return { found, close: () => module.close() };
  };

  it('acha os providers anotados e ignora o resto', async () => {
    const { found, close } = await explore([AnnotatedHandler, PlainProvider]);

    expect(found.map((wrapper) => wrapper.metatype)).toContain(
      AnnotatedHandler,
    );
    expect(found.map((wrapper) => wrapper.metatype)).not.toContain(
      PlainProvider,
    );
    await close();
  });

  it('devolve o wrapper, não a instância — é ele que sabe do escopo', async () => {
    const { found, close } = await explore([AnnotatedHandler]);

    const wrapper = found.find(
      (candidate) => candidate.metatype === AnnotatedHandler,
    )!;
    expect(wrapper.isDependencyTreeStatic).toBeTypeOf('function');
    expect(wrapper.instance).toBeInstanceOf(AnnotatedHandler);
    await close();
  });

  it('enxerga também o handler criado por factory provider', async () => {
    const { found, close } = await explore([
      {
        provide: 'FACTORY_HANDLER',
        useFactory: () => new FactoryBuiltHandler(),
      },
    ]);

    expect(found.map((wrapper) => wrapper.instance?.constructor)).toContain(
      FactoryBuiltHandler,
    );
    await close();
  });

  it('sem nenhum handler anotado, a varredura volta vazia em vez de estourar', async () => {
    const { found, close } = await explore([PlainProvider]);

    expect(found.map((wrapper) => wrapper.metatype)).not.toContain(
      PlainProvider,
    );
    expect(found.every((wrapper) => wrapper.metatype !== PlainProvider)).toBe(
      true,
    );
    await close();
  });
});
