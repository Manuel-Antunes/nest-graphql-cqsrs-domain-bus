import type { Provider, Type } from '@nestjs/common';
import type { CqrsModuleOptions } from '@nestjs/cqrs';
import type { ISubscriptionPublisher } from './subscription-publisher.interface';

/**
 * As opções do `CqsrsModule`: as do `CqrsModule` (repassadas inteiras para ele) mais a única peça
 * que o CQSRS acrescenta.
 */
export interface CqsrsModuleOptions extends CqrsModuleOptions {
  /**
   * Para onde anunciar cada subscription pedida.
   * @default DefaultSubscriptionPubSub (em memória, o `Subject` do próprio bus)
   */
  subscriptionPublisher?: ISubscriptionPublisher;
}

/** Quem sabe montar as opções do CQSRS — o alvo de `useClass` / `useExisting` no `forRootAsync`. */
export interface CqsrsModuleOptionsFactory {
  createCqsrsOptions(): Promise<CqsrsModuleOptions> | CqsrsModuleOptions;
}

/**
 * As opções do `CqsrsModule.forRootAsync`, nas quatro formas de sempre do Nest. Espelha o
 * `CqrsModuleAsyncOptions` do @nestjs/cqrs, com uma diferença: aqui o `extraProviders` é de fato
 * registrado (no módulo de opções, junto de quem depende dele).
 */
export interface CqsrsModuleAsyncOptions {
  /** Módulos que exportam o que a factory injeta (um `ConfigModule`, por exemplo). */
  imports?: any[];
  useExisting?: Type<CqsrsModuleOptionsFactory>;
  useClass?: Type<CqsrsModuleOptionsFactory>;
  useFactory?: (...args: any[]) => Promise<CqsrsModuleOptions> | CqsrsModuleOptions;
  useValue?: CqsrsModuleOptions;
  /** O que injetar na `useFactory`. */
  inject?: any[];
  /** Providers extras registrados ao lado das opções — úteis para o que a factory injeta. */
  extraProviders?: Provider[];
}
