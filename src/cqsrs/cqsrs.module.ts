import { type DynamicModule, Module, type OnApplicationBootstrap, type Provider } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { CQSRS_MODULE_OPTIONS } from './constants';
import type { CqsrsModuleAsyncOptions, CqsrsModuleOptions, CqsrsModuleOptionsFactory } from './interfaces';
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
 * `forRoot` and `forRootAsync` are the entry points: importing the bare `CqsrsModule` class gives the
 * `SubscriptionBus` without the CQRS buses.
 */
@Module({
  providers: [SubscriptionBus, SubscriptionExplorerService],
  exports: [SubscriptionBus],
})
export class CqsrsModule implements OnApplicationBootstrap {
  static forRoot(options?: CqsrsModuleOptions): DynamicModule {
    return {
      module: CqsrsModule,
      global: true,
      imports: [CqrsModule.forRoot(options)],
      providers: [{ provide: CQSRS_MODULE_OPTIONS, useValue: options ?? {} }],
      exports: [CqrsModule],
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
        optionsModule,
        CqrsModule.forRootAsync({
          imports: [optionsModule],
          inject: [CQSRS_MODULE_OPTIONS],
          useFactory: (resolved: CqsrsModuleOptions) => resolved,
        }),
      ],
      exports: [CqrsModule],
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
