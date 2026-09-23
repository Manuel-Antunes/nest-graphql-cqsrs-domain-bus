import type { DynamicModule, OnApplicationBootstrap } from '@nestjs/common';
import { Module } from '@nestjs/common';

import type {
  CqsrsModuleAsyncOptions,
  CqsrsModuleRootOptions,
} from './cqsrs.module-definition';
import { ConfigurableCqsrsModule } from './cqsrs.module-definition';
import { SubscriptionExplorerService } from './services/subscription-explorer.service';
import { SubscriptionBus } from './subscription-bus';
import { UnitOfWorkCommands } from './unit-of-work-commands';

/**
 * **C**ommand, **Q**uery and **S**ubscription **R**esponsibility **S**egregation: Nest's `CqrsModule`
 * plus the third message.
 *
 * It does not replace @nestjs/cqrs — it imports and re-exports it. Anyone using `CqsrsModule.forRoot()`
 * still gets `CommandBus`, `QueryBus`, `EventBus`, `EventPublisher` and `UnhandledExceptionBus` exactly
 * as before, and gains the `SubscriptionBus`. The options passed here go wholesale to
 * `CqrsModule.forRootAsync`, plus the one only CQSRS understands (`subscriptionPublisher`).
 *
 * `forRoot` and `forRootAsync` come from Nest's `ConfigurableModuleBuilder`
 * (`cqsrs.module-definition.ts`), whose definition transform imports `CqrsModule` in both: the options
 * are resolved once, in `CqsrsOptionsModule`, and `CqrsModule` is handed a factory that forwards them.
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
 * the wrong publisher by injecting the obvious thing. It is bound by `AggregatePublisherModule`, which
 * is why it answers instead of Nest's own. The publisher itself has to come from a global module,
 * since that is where the binding is resolved.
 *
 * ```ts
 * CqsrsModule.forRoot({ aggregatePublisher: TRANSPORT_EVENT_BUS_PUBLISHER })
 * ```
 *
 * `forRoot` and `forRootAsync` are the entry points: importing the bare `CqsrsModule` class gives the
 * `SubscriptionBus` without the CQRS buses.
 */
@Module({
  providers: [SubscriptionBus, SubscriptionExplorerService, UnitOfWorkCommands],
  exports: [SubscriptionBus],
})
export class CqsrsModule
  extends ConfigurableCqsrsModule
  implements OnApplicationBootstrap
{
  static override forRoot(options: CqsrsModuleRootOptions = {}): DynamicModule {
    // biome-ignore lint/complexity/noThisInStatic: the builder names `this` as the module, and the class name would make it ConfigurableCqsrsModule
    return super.forRoot(options);
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
   *   aggregatePublisher: TRANSPORT_EVENT_BUS_PUBLISHER,
   * })
   * ```
   */
  static override forRootAsync({
    useValue,
    ...options
  }: CqsrsModuleAsyncOptions): DynamicModule {
    const source = useValue
      ? { ...options, useFactory: () => useValue }
      : options;
    if (!source.useFactory && !source.useClass && !source.useExisting) {
      throw new Error(
        'Invalid CqsrsModuleAsyncOptions configuration. Provide useValue, useFactory, useClass, or useExisting.',
      );
    }
    // biome-ignore lint/complexity/noThisInStatic: the builder names `this` as the module, and the class name would make it ConfigurableCqsrsModule
    return super.forRootAsync(source);
  }

  constructor(
    private readonly explorerService: SubscriptionExplorerService,
    private readonly subscriptionBus: SubscriptionBus,
  ) {
    super();
  }

  onApplicationBootstrap(): void {
    this.subscriptionBus.register(this.explorerService.explore());
  }
}
