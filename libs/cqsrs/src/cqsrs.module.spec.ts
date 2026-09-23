import type { IEvent, IEventPublisher } from '@nestjs/cqrs';
import type { TestingModule } from '@nestjs/testing';
import type { Observable } from 'rxjs';
import { Global, Inject, Injectable, Module, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import {
  CommandBus,
  EventBus,
  EventPublisher,
  ofType,
  QueryBus,
} from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';

import type {
  CqsrsModuleOptions,
  CqsrsModuleOptionsFactory,
  ISubscriptionHandler,
  ISubscriptionPublisher,
} from './interfaces/index';
import { Subscription } from './classes/subscription';
import { CqsrsModule } from './cqsrs.module';
import { SubscriptionHandler } from './decorators/subscription-handler.decorator';
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

const subscriptionPublisher: ISubscriptionPublisher = { publish: () => {} };
const eventPublisher: IEventPublisher = {
  publish: <T extends IEvent>(_event: T) => {},
};
const options: CqsrsModuleOptions = { subscriptionPublisher, eventPublisher };

const AGGREGATE_PUBLISHER = 'AGGREGATE_PUBLISHER';

@Injectable()
class ApplicationPublisher extends EventPublisher {
  constructor(eventBus: EventBus) {
    super(eventBus);
  }
}

@Global()
@Module({
  providers: [
    ApplicationPublisher,
    { provide: AGGREGATE_PUBLISHER, useExisting: ApplicationPublisher },
  ],
  exports: [AGGREGATE_PUBLISHER],
})
class ApplicationPublisherModule {}

@Injectable()
class PublishingHandler {
  constructor(readonly publisher: EventPublisher) {}
}

@Injectable({ scope: Scope.REQUEST })
class RequestScopedHandler {
  constructor(
    readonly publisher: EventPublisher,
    @Inject(REQUEST) readonly request: unknown,
  ) {}
}

@Module({ providers: [PublishingHandler, RequestScopedHandler] })
class HandlersModule {}

const CONFIG = 'CONFIG';

@Module({
  providers: [{ provide: CONFIG, useValue: { url: 'redis://' } }],
  exports: [CONFIG],
})
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

describe("CqsrsModule and the application's EventPublisher", () => {
  let module: TestingModule;

  afterEach(async () => module?.close());

  /**
   * A handler resolves the publisher along one of two paths, and they have different winners: from the
   * module that imports `CqsrsModule.forRoot(...)`, through that module's exports; from a module that
   * imports nothing of the sort, through the global modules. Both shapes are built here, because the
   * cost of getting either wrong is silence — the handler publishes locally and the events never leave.
   */
  const inTheImportingModule = (imports: any[]) => [
    (() => {
      @Module({ imports, providers: [PublishingHandler, RequestScopedHandler] })
      class ImportingModule {}
      return ImportingModule;
    })(),
  ];

  const inAnotherModule = (imports: any[]) => [...imports, HandlersModule];

  const bootstrap = async (imports: any[]) => {
    module = await Test.createTestingModule({ imports }).compile();
    await module.init();
    return module;
  };

  const namedPublisher = [
    CqsrsModule.forRoot({ aggregatePublisher: AGGREGATE_PUBLISHER }),
    ApplicationPublisherModule,
  ];

  it('is the CqrsModule one when the application names none', async () => {
    const app = await bootstrap(inAnotherModule([CqsrsModule.forRoot()]));

    const publisher = app.get(PublishingHandler, { strict: false }).publisher;
    expect(publisher).toBeInstanceOf(EventPublisher);
    expect(publisher).not.toBeInstanceOf(ApplicationPublisher);
  });

  it.each([
    ['the module that imports CqsrsModule', inTheImportingModule],
    ['a module that imports nothing of the sort', inAnotherModule],
  ])('is the named one for a handler in %s', async (_shape, arrange) => {
    const app = await bootstrap(arrange(namedPublisher));

    expect(app.get(PublishingHandler, { strict: false }).publisher).toBe(
      app.get(ApplicationPublisher, { strict: false }),
    );
  });

  it.each([
    ['the module that imports CqsrsModule', inTheImportingModule],
    ['a module that imports nothing of the sort', inAnotherModule],
  ])(
    'is the named one for a REQUEST-scoped handler in %s',
    async (_shape, arrange) => {
      const app = await bootstrap(arrange(namedPublisher));

      const handler = await app.resolve(RequestScopedHandler, undefined, {
        strict: false,
      });
      expect(handler.publisher).toBe(
        app.get(ApplicationPublisher, { strict: false }),
      );
    },
  );

  it('is the named one with the options resolved asynchronously too', async () => {
    const app = await bootstrap(
      inAnotherModule([
        CqsrsModule.forRootAsync({
          useValue: {},
          aggregatePublisher: AGGREGATE_PUBLISHER,
        }),
        ApplicationPublisherModule,
      ]),
    );

    expect(app.get(PublishingHandler, { strict: false }).publisher).toBe(
      app.get(ApplicationPublisher, { strict: false }),
    );
  });
});

describe('CqsrsModule.forRootAsync', () => {
  let module: TestingModule;

  const bootstrap = async (imports: any[]) => {
    module = await Test.createTestingModule({
      imports,
      providers: [OnPingedHandler],
    }).compile();
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

    expect(calls).toBe(1);
    expect(app.get(SubscriptionBus).publisher).toBe(subscriptionPublisher);
    expect(app.get(EventBus).publisher).toBe(eventPublisher);
  });

  it.each([
    ['useValue', () => CqsrsModule.forRootAsync({ useValue: options })],
    ['useClass', () => CqsrsModule.forRootAsync({ useClass: OptionsFactory })],
    [
      'useExisting',
      () =>
        CqsrsModule.forRootAsync({
          imports: [OptionsFactoryModule],
          useExisting: OptionsFactory,
        }),
    ],
  ])('resolves the options with %s', async (_form, build) => {
    const app = await bootstrap([build()]);

    expect(app.get(SubscriptionBus).publisher).toBe(subscriptionPublisher);
    expect(app.get(EventBus).publisher).toBe(eventPublisher);
  });

  it.each([
    ['useClass', () => CqsrsModule.forRootAsync({ useClass: OptionsFactory })],
    [
      'useExisting',
      () =>
        CqsrsModule.forRootAsync({
          imports: [OptionsFactoryModule],
          useExisting: OptionsFactory,
        }),
    ],
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

  it('accepts a useFactory with no dependencies to inject', async () => {
    let calls = 0;
    const app = await bootstrap([
      CqsrsModule.forRootAsync({
        useFactory: () => {
          calls += 1;
          return options;
        },
      }),
    ]);

    expect(calls).toBe(1);
    expect(app.get(SubscriptionBus).publisher).toBe(subscriptionPublisher);
    expect(app.get(EventBus).publisher).toBe(eventPublisher);
  });

  it('refuses a configuration that says nothing about where the options come from', () => {
    expect(() => CqsrsModule.forRootAsync({})).toThrow(
      /useValue, useFactory, useClass, or useExisting/,
    );
  });
});
