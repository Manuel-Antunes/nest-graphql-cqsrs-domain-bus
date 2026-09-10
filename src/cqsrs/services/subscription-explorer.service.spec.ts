import { Injectable } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Observable } from 'rxjs';
import { EMPTY } from 'rxjs';
import { Subscription } from '../classes/subscription';
import { SubscriptionHandler } from '../decorators/subscription-handler.decorator';
import type { ISubscriptionHandler } from '../interfaces/subscription-handler.interface';
import { SubscriptionExplorerService } from './subscription-explorer.service';

/**
 * A varredura que roda uma vez, no `onApplicationBootstrap`: quais providers, de **todos** os
 * módulos, estão anotados com `@SubscriptionHandler`.
 *
 * Dois detalhes justificam o teste, e os dois são fáceis de quebrar sem que nada acuse:
 *
 * - ela devolve `InstanceWrapper`s, e não instâncias — é o wrapper que sabe se o handler é estático
 *   ou request-scoped, e essa é a bifurcação de que o `SubscriptionBus.bind` depende;
 * - um **factory provider** (`useFactory`) não tem `metatype`; a classe dele só aparece pelo
 *   `instance.constructor`. Um explorer que olhasse só o `metatype` simplesmente não enxergaria esse
 *   handler, e a subscription dele ficaria sem rota — em silêncio.
 */
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

  /** Um provider comum, sem a anotação: o explorer não pode devolvê-lo. */
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
    // Arrange / Act
    const { found, close } = await explore([AnnotatedHandler, PlainProvider]);

    // Assert
    expect(found.map((wrapper) => wrapper.metatype)).toContain(AnnotatedHandler);
    expect(found.map((wrapper) => wrapper.metatype)).not.toContain(PlainProvider);
    await close();
  });

  it('devolve o wrapper, não a instância — é ele que sabe do escopo', async () => {
    // Arrange / Act
    const { found, close } = await explore([AnnotatedHandler]);

    // Assert
    const wrapper = found.find((candidate) => candidate.metatype === AnnotatedHandler)!;
    expect(wrapper.isDependencyTreeStatic).toBeTypeOf('function');
    expect(wrapper.instance).toBeInstanceOf(AnnotatedHandler);
    await close();
  });

  /** O caso do `useFactory`: sem `metatype`, a classe só aparece pelo construtor da instância. */
  it('enxerga também o handler criado por factory provider', async () => {
    // Arrange / Act
    const { found, close } = await explore([
      { provide: 'FACTORY_HANDLER', useFactory: () => new FactoryBuiltHandler() },
    ]);

    // Assert
    expect(found.map((wrapper) => wrapper.instance?.constructor)).toContain(FactoryBuiltHandler);
    await close();
  });

  it('sem nenhum handler anotado, a varredura volta vazia em vez de estourar', async () => {
    // Arrange / Act
    const { found, close } = await explore([PlainProvider]);

    // Assert
    expect(found.map((wrapper) => wrapper.metatype)).not.toContain(PlainProvider);
    expect(found.every((wrapper) => wrapper.metatype !== PlainProvider)).toBe(true);
    await close();
  });
});
