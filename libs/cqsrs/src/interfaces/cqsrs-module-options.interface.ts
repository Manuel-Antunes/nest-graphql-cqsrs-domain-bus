import type { InjectionToken, Provider, Type } from '@nestjs/common';
import type { CqrsModuleOptions } from '@nestjs/cqrs';
import type { ISubscriptionPublisher } from './subscription-publisher.interface';

/**
 * The `CqsrsModule` options: the `CqrsModule` ones (forwarded to it wholesale) plus the single piece
 * CQSRS adds.
 */
export interface CqsrsModuleOptions extends CqrsModuleOptions {
  /**
   * What the `EventPublisher` of this application **is**: the token or class every
   * `mergeObjectContext` goes through.
   *
   * With it bound, `constructor(private readonly publisher: EventPublisher)` **is** the application's
   * publisher — in any module, without a token — and a handler cannot pick the wrong one by injecting
   * the obvious thing.
   *
   * Not to be confused with `eventPublisher`, which is the *bus's* outbound strategy (an
   * `IEventPublisher`): this one is the helper an aggregate is merged into.
   *
   * The publisher itself has to come from a **global** module, because this is where the binding is
   * resolved.
   *
   * @default EventPublisher, as `CqrsModule` provides it
   */
  aggregatePublisher?: InjectionToken;

  /**
   * Where to announce every requested subscription.
   * @default DefaultSubscriptionPubSub (in memory, the bus's own `Subject`)
   */
  subscriptionPublisher?: ISubscriptionPublisher;

}

/** Whoever knows how to build the CQSRS options — the target of `useClass` / `useExisting` in `forRootAsync`. */
export interface CqsrsModuleOptionsFactory {
  createCqsrsOptions(): Promise<CqsrsModuleOptions> | CqsrsModuleOptions;
}

/**
 * The `CqsrsModule.forRootAsync` options, in Nest's usual four shapes. Mirrors @nestjs/cqrs's
 * `CqrsModuleAsyncOptions`, with one difference: here `extraProviders` is actually registered (in the
 * options module, alongside whoever depends on it).
 */
export interface CqsrsModuleAsyncOptions {
  /** Modules exporting whatever the factory injects (a `ConfigModule`, for instance). */
  imports?: any[];
  useExisting?: Type<CqsrsModuleOptionsFactory>;
  useClass?: Type<CqsrsModuleOptionsFactory>;
  useFactory?: (...args: any[]) => Promise<CqsrsModuleOptions> | CqsrsModuleOptions;
  useValue?: CqsrsModuleOptions;
  /** What to inject into `useFactory`. */
  inject?: any[];
  /** Extra providers registered alongside the options — useful for whatever the factory injects. */
  extraProviders?: Provider[];
  /**
   * The application's `EventPublisher` — see {@link CqsrsModuleOptions.aggregatePublisher}. It is a
   * provider binding rather than a value, so it is declared here and not returned by the factory: the
   * module has to know it while it is being built, which is before any factory runs.
   */
  aggregatePublisher?: InjectionToken;

}
