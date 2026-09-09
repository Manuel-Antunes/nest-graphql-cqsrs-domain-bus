import { Injectable, Module } from '@nestjs/common';
import { CommandBus, EventBus, type IEvent, type IEventPublisher, ofType, QueryBus } from '@nestjs/cqrs';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Observable } from 'rxjs';
import { Subscription } from './classes/subscription';
import { CqsrsModule } from './cqsrs.module';
import { SubscriptionHandler } from './decorators/subscription-handler.decorator';
import type {
  CqsrsModuleOptions,
  CqsrsModuleOptionsFactory,
  ISubscriptionHandler,
  ISubscriptionPublisher,
} from './interfaces';
import { SubscriptionBus } from './subscription-bus';

class Pinged {
  constructor(readonly at: number) {}
}

class OnPinged extends Subscription<Pinged> {}

@SubscriptionHandler(OnPinged)
class OnPingedHandler implements ISubscriptionHandler<OnPinged> {
  constructor(private readonly eventBus: EventBus) {}

  subscribe(): Observable<Pinged> {
    return this.eventBus.pipe(ofType(Pinged));
  }
}

/** Publishers só para provar identidade: se o bus recebeu *este* objeto, a opção chegou nele. */
const subscriptionPublisher: ISubscriptionPublisher = { publish: () => {} };
const eventPublisher: IEventPublisher = { publish: <T extends IEvent>(_event: T) => {} };
const options: CqsrsModuleOptions = { subscriptionPublisher, eventPublisher };

const CONFIG = 'CONFIG';

@Module({ providers: [{ provide: CONFIG, useValue: { url: 'redis://' } }], exports: [CONFIG] })
class ConfigStubModule {}

@Injectable()
class OptionsFactory implements CqsrsModuleOptionsFactory {
  static calls = 0;

  createCqsrsOptions(): CqsrsModuleOptions {
    OptionsFactory.calls += 1;
    return options;
  }
}

@Module({ providers: [OptionsFactory], exports: [OptionsFactory] })
class OptionsFactoryModule {}

describe('CqsrsModule.forRootAsync', () => {
  let module: TestingModule;

  const bootstrap = async (imports: any[]) => {
    module = await Test.createTestingModule({ imports, providers: [OnPingedHandler] }).compile();
    await module.init();
    return module;
  };

  beforeEach(() => {
    OptionsFactory.calls = 0;
  });
  afterEach(async () => module?.close());

  it('resolves the options with useFactory — once, not once per bus — and hands them to both sides', async () => {
    let calls = 0;
    const app = await bootstrap([
      CqsrsModule.forRootAsync({
        imports: [ConfigStubModule],
        inject: [CONFIG],
        useFactory: async (config: { url: string }) => {
          calls += 1;
          expect(config.url).toBe('redis://');
          return options;
        },
      }),
    ]);

    // a factory de quem chama roda uma vez só, mesmo servindo ao CqsrsModule e ao CqrsModule embaixo
    expect(calls).toBe(1);
    // a opção do CQSRS chegou no SubscriptionBus…
    expect(app.get(SubscriptionBus).publisher).toBe(subscriptionPublisher);
    // …e as do CQRS foram repassadas inteiras para o CqrsModule
    expect(app.get(EventBus).publisher).toBe(eventPublisher);
  });

  it.each([
    ['useValue', () => CqsrsModule.forRootAsync({ useValue: options })],
    ['useClass', () => CqsrsModule.forRootAsync({ useClass: OptionsFactory })],
    ['useExisting', () => CqsrsModule.forRootAsync({ imports: [OptionsFactoryModule], useExisting: OptionsFactory })],
  ])('resolves the options with %s', async (_form, build) => {
    const app = await bootstrap([build()]);

    expect(app.get(SubscriptionBus).publisher).toBe(subscriptionPublisher);
    expect(app.get(EventBus).publisher).toBe(eventPublisher);
  });

  it.each([
    ['useClass', () => CqsrsModule.forRootAsync({ useClass: OptionsFactory })],
    ['useExisting', () => CqsrsModule.forRootAsync({ imports: [OptionsFactoryModule], useExisting: OptionsFactory })],
  ])('calls the %s factory once', async (_form, build) => {
    await bootstrap([build()]);

    expect(OptionsFactory.calls).toBe(1);
  });

  it('exports the CQRS buses and the SubscriptionBus, and registers the @SubscriptionHandler on bootstrap', async () => {
    const app = await bootstrap([CqsrsModule.forRootAsync({ useValue: {} })]);
    const received: Pinged[] = [];

    expect(app.get(CommandBus)).toBeInstanceOf(CommandBus);
    expect(app.get(QueryBus)).toBeInstanceOf(QueryBus);
    const stream = app.get(SubscriptionBus).subscribe(new OnPinged());
    const subscription = stream.subscribe((event) => received.push(event));
    app.get(EventBus).publish(new Pinged(1));
    subscription.unsubscribe();

    expect(received).toEqual([new Pinged(1)]);
  });

  it('refuses a configuration that says nothing about where the options come from', () => {
    expect(() => CqsrsModule.forRootAsync({})).toThrow(/useValue, useFactory, useClass, or useExisting/);
  });
});
