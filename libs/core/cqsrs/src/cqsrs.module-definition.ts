import type {
  ConfigurableModuleOptionsFactory,
  DynamicModule,
  InjectionToken,
} from '@nestjs/common';
import { ConfigurableModuleBuilder, Module } from '@nestjs/common';
import { CqrsModule, EventPublisher } from '@nestjs/cqrs';

import { CQSRS_MODULE_OPTIONS } from './constants';
import type { CqsrsModuleExtras, CqsrsModuleOptions } from './interfaces/index';

/**
 * The module that holds the resolved options and exports them under the `CQSRS_MODULE_OPTIONS`
 * token — the piece that makes `forRootAsync` call the user's factory **exactly once**.
 *
 * Without it there would be two factories to resolve: `CqsrsModule`'s and the underlying
 * `CqrsModule`'s. With it there is one: this module resolves the options, `CqsrsModule` consumes them,
 * and `CqrsModule.forRootAsync` gets a factory that merely forwards what was already resolved here.
 * It is the same dynamic module object in both `imports` lists, so it is a single instance.
 */
@Module({})
export class CqsrsOptionsModule {}

/**
 * The module that makes the application's `EventPublisher` **the** `EventPublisher`.
 *
 * ## Why the substitution needs a module of its own, and why its POSITION is the whole trick
 * `EventPublisher` already has a provider — `CqrsModule`'s — and `CqsrsModule` re-exports that
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

const aggregatePublisherModules = (
  publisher?: InjectionToken,
): DynamicModule[] =>
  publisher && publisher !== EventPublisher
    ? [AggregatePublisherModule.bind(publisher)]
    : [];

const withCqrsModule = (
  definition: DynamicModule,
  { aggregatePublisher }: CqsrsModuleExtras,
): DynamicModule => {
  const publisher = aggregatePublisherModules(aggregatePublisher);
  const options: DynamicModule = {
    module: CqsrsOptionsModule,
    imports: definition.imports ?? [],
    providers: definition.providers ?? [],
    exports: [CQSRS_MODULE_OPTIONS],
  };
  return {
    module: definition.module,
    global: true,
    imports: [
      ...publisher,
      options,
      CqrsModule.forRootAsync({
        imports: [options],
        inject: [CQSRS_MODULE_OPTIONS],
        useFactory: (resolved: CqsrsModuleOptions) => resolved,
      }),
    ],
    exports: [...publisher, CqrsModule],
  };
};

export const {
  ConfigurableModuleClass: ConfigurableCqsrsModule,
  OPTIONS_TYPE,
  ASYNC_OPTIONS_TYPE,
} = new ConfigurableModuleBuilder<CqsrsModuleOptions>({
  optionsInjectionToken: CQSRS_MODULE_OPTIONS,
})
  .setClassMethodName('forRoot')
  .setFactoryMethodName('createCqsrsOptions')
  .setExtras<CqsrsModuleExtras>(
    { aggregatePublisher: undefined },
    withCqrsModule,
  )
  .build();

/** The `CqsrsModule.forRoot` argument: the options, plus the extras that shape the module. */
export type CqsrsModuleRootOptions = typeof OPTIONS_TYPE;

/**
 * The `CqsrsModule.forRootAsync` argument, in Nest's usual shapes — `useFactory`, `useClass`,
 * `useExisting` — plus `useValue`, which @nestjs/cqrs accepts and the builder does not.
 */
export type CqsrsModuleAsyncOptions = typeof ASYNC_OPTIONS_TYPE & {
  useValue?: CqsrsModuleOptions;
};

/** Whoever knows how to build the CQSRS options — the target of `useClass` / `useExisting` in `forRootAsync`. */
export type CqsrsModuleOptionsFactory = ConfigurableModuleOptionsFactory<
  CqsrsModuleOptions,
  'createCqsrsOptions'
>;
