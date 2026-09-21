import {
  type DynamicModule,
  type InjectionToken,
  Module,
  type OnApplicationBootstrap,
  type Provider,
} from '@nestjs/common';
import { CqrsModule, EventPublisher } from '@nestjs/cqrs';
import { CQSRS_MODULE_OPTIONS } from './constants';
import type { CqsrsModuleAsyncOptions, CqsrsModuleOptions, CqsrsModuleOptionsFactory } from './interfaces/index';
import { SubscriptionExplorerService } from './services/subscription-explorer.service';
import { SubscriptionBus } from './subscription-bus';

/**
 * The module that resolves the options and exports them under the `CQSRS_MODULE_OPTIONS` token — the
 * piece that makes `forRootAsync` call the user's factory **exactly once**.
 *
 * Without it there would be two factories to resolve: `CqsrsModule`'s and the underlying
 * `CqrsModule`'s. With it there is one: this module resolves the options, `CqsrsModule` consumes them,
 * and `CqrsModule.forRootAsync` gets a factory that merely forwards what was already resolved here.
 */
@Module({})
export class CqsrsOptionsModule {}

/**
 * The module that makes the application's `EventPublisher` **the** `EventPublisher`.
 *
 * ## Why the substitution needs a module of its own, and why its POSITION is the whole trick
 * `EventPublisher` already has a provider — `CqrsModule`'s — and {@link CqsrsModule} re-exports that
 * module. Two providers of one token means whoever is consulted first answers, and a handler consults
 * along one of two paths:
 *
 * | the handler's module | resolves through | who answers first |
 * |---|---|---|
 * | imports `CqsrsModule.forRoot(...)` (the root module, usually) | that module's **exports**, in order | whatever is exported before `CqrsModule` |
 * | imports nothing of the sort (a feature module) | the **global** modules, in registration order | whatever was registered before `CqrsModule` |
 *
 * This module is therefore both **imported and exported before `CqrsModule`**, and it is one object in
 * both lists so the two paths cannot disagree. Getting either order wrong does not fail: the handler
 * receives Nest's plain publisher, `commit()` publishes locally, the events never leave, and nothing
 * says so — which is why `cqsrs.module.spec.ts` asserts the publisher a handler gets in both shapes.
 */
@Module({})
export class AggregatePublisherModule {
  static bind(publisher: InjectionToken): DynamicModule {
    return {
      module: AggregatePublisherModule,
      global: true,
      providers: [{ provide: EventPublisher, useExisting: publisher }],
      exports: [EventPublisher],
    };
  }
}

/**
 * **C**ommand, **Q**uery and **S**ubscription **R**esponsibility **S**egregation: Nest's `CqrsModule`
 * plus the third message.
 *
 * It does not replace @nestjs/cqrs — it imports and re-exports it. Anyone using `CqsrsModule.forRoot()`
 * still gets `CommandBus`, `QueryBus`, `EventBus`, `EventPublisher` and `UnhandledExceptionBus` exactly
 * as before, and gains the `SubscriptionBus`. The options passed here go wholesale to
 * `CqrsModule.forRoot`, plus the one only CQSRS understands (`subscriptionPublisher`).
 *
 * Bootstrap follows the same pattern as `CqrsModule`: in `onApplicationBootstrap`, the explorer scans
 * the providers for `@SubscriptionHandler`s and registers them on the bus. It happens *after* commands,
 * queries, events and sagas are registered, because `CqsrsModule` imports `CqrsModule` — and a module
 * is initialized after whatever it imports.
 *
 * ```ts
 * @Module({ imports: [CqsrsModule.forRoot()], providers: [OnPostUpdatedSubscriptionHandler] })
 * export class AppModule {}
 * ```
 *
 * `aggregatePublisher` is what makes an application's own `EventPublisher` **the** `EventPublisher`:
 * every handler that injects `EventPublisher` — in any module — gets that one, so a handler cannot pick
 * the wrong publisher by injecting the obvious thing. It is bound by
 * {@link AggregatePublisherModule}, which is why it answers instead of Nest's own. The publisher itself
 * has to come from a global module, since that is where the binding is resolved.
 *
 * ```ts
 * CqsrsModule.forRoot({ aggregatePublisher: TRANSPORT_EVENT_BUS_PUBLISHER })
 * ```
 *
 * `forRoot` and `forRootAsync` are the entry points: importing the bare `CqsrsModule` class gives the
 * `SubscriptionBus` without the CQRS buses.
 */
@Module({
  providers: [SubscriptionBus, SubscriptionExplorerService],
  exports: [SubscriptionBus],
})
export class CqsrsModule implements OnApplicationBootstrap {
  static forRoot(options?: CqsrsModuleOptions): DynamicModule {
    const publisher = aggregatePublisherModule(options?.aggregatePublisher);
    return {
      module: CqsrsModule,
      global: true,
      imports: [...publisher, CqrsModule.forRoot(options)],
      providers: [{ provide: CQSRS_MODULE_OPTIONS, useValue: options ?? {} }],
      exports: [...publisher, CqrsModule],
    };
  }

  /**
   * The same, with the options resolved asynchronously — for when the publisher (of events, of
   * subscriptions) depends on something that only exists at runtime: a `ConfigService`, a connection.
   *
   * ```ts
   * CqsrsModule.forRootAsync({
   *   imports: [ConfigModule],
   *   inject: [ConfigService],
   *   useFactory: (config: ConfigService) => ({ subscriptionPublisher: new RedisSubscriptionPubSub(config.get('REDIS_URL')) }),
   * })
   * ```
   *
   * The wiring has a subtlety worth the paragraph: the options are resolved in **a single module**
   * ({@link CqsrsOptionsModule}), and both `CqsrsModule` and the underlying `CqrsModule` consume them
   * from there. `CqrsModule.forRootAsync` receives a factory that merely forwards what was already
   * resolved — so the caller's factory runs once, not twice. It is the same dynamic module object in
   * both `imports` lists: Nest identifies a dynamic module by the (class, metadata) pair, so the two
   * references are the same module, with a single instance.
   */
  static forRootAsync(options: CqsrsModuleAsyncOptions): DynamicModule {
    const publisher = aggregatePublisherModule(options.aggregatePublisher);
    const optionsModule: DynamicModule = {
      module: CqsrsOptionsModule,
      imports: options.imports ?? [],
      providers: [...this.createAsyncProviders(options), ...(options.extraProviders ?? [])],
      exports: [CQSRS_MODULE_OPTIONS],
    };
    return {
      module: CqsrsModule,
      global: true,
      imports: [
        ...publisher,
        optionsModule,
        CqrsModule.forRootAsync({
          imports: [optionsModule],
          inject: [CQSRS_MODULE_OPTIONS],
          useFactory: (resolved: CqsrsModuleOptions) => resolved,
        }),
      ],
      exports: [...publisher, CqrsModule],
    };
  }

  private static createAsyncProviders(options: CqsrsModuleAsyncOptions): Provider[] {
    if (options.useValue) {
      return [{ provide: CQSRS_MODULE_OPTIONS, useValue: options.useValue }];
    }
    if (options.useFactory) {
      return [{ provide: CQSRS_MODULE_OPTIONS, useFactory: options.useFactory, inject: options.inject ?? [] }];
    }
    if (options.useClass) {
      return [
        { provide: options.useClass, useClass: options.useClass },
        {
          provide: CQSRS_MODULE_OPTIONS,
          useFactory: (factory: CqsrsModuleOptionsFactory) => factory.createCqsrsOptions(),
          inject: [options.useClass],
        },
      ];
    }
    if (options.useExisting) {
      return [
        {
          provide: CQSRS_MODULE_OPTIONS,
          useFactory: (factory: CqsrsModuleOptionsFactory) => factory.createCqsrsOptions(),
          inject: [options.useExisting],
        },
      ];
    }
    throw new Error('Invalid CqsrsModuleAsyncOptions configuration. Provide useValue, useFactory, useClass, or useExisting.');
  }

  constructor(
    private readonly explorerService: SubscriptionExplorerService,
    private readonly subscriptionBus: SubscriptionBus,
  ) {}

  onApplicationBootstrap(): void {
    this.subscriptionBus.register(this.explorerService.explore());
  }
}

const aggregatePublisherModule = (publisher?: InjectionToken): DynamicModule[] =>
  publisher && publisher !== EventPublisher ? [AggregatePublisherModule.bind(publisher)] : [];
