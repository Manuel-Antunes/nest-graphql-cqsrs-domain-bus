import type { Provider, Type } from '@nestjs/common';
import type { CqrsModuleOptions } from '@nestjs/cqrs';
import type { ISubscriptionPublisher } from './subscription-publisher.interface';

/**
 * The `CqsrsModule` options: the `CqrsModule` ones (forwarded to it wholesale) plus the single piece
 * CQSRS adds.
 */
export interface CqsrsModuleOptions extends CqrsModuleOptions {
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
}
