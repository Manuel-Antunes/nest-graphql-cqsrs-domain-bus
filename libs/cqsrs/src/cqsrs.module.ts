import { type DynamicModule, Module, type OnApplicationBootstrap, type Provider } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { CQSRS_MODULE_OPTIONS } from './constants';
import type { CqsrsModuleAsyncOptions, CqsrsModuleOptions, CqsrsModuleOptionsFactory } from './interfaces';
import { EventStream } from './event-stream';
import { RemoteEventBus } from './remote-event-bus';
import { SubscriptionExplorerService } from './services/subscription-explorer.service';
import { SubscriptionBus } from './subscription-bus';

/**
 * O módulo que resolve as opções e as exporta pelo token `CQSRS_MODULE_OPTIONS` — a peça que faz o
 * `forRootAsync` chamar a factory do usuário **uma vez só**.
 *
 * Sem ele haveria duas factories a resolver: a do `CqsrsModule` e a do `CqrsModule` embaixo. Com ele
 * há uma: este módulo resolve as opções, o `CqsrsModule` as consome, e o `CqrsModule.forRootAsync`
 * recebe uma factory que só repassa o que já foi resolvido aqui.
 */
@Module({})
export class CqsrsOptionsModule {}

/**
 * **C**ommand, **Q**uery e **S**ubscription **R**esponsibility **S**egregation: o `CqrsModule` do
 * Nest mais a terceira mensagem.
 *
 * Ele não substitui o @nestjs/cqrs — ele o importa e o reexporta. Quem usa `CqsrsModule.forRoot()`
 * continua recebendo `CommandBus`, `QueryBus`, `EventBus`, `EventPublisher` e
 * `UnhandledExceptionBus` exatamente como antes, e ganha o `SubscriptionBus`. As opções passadas
 * aqui vão inteiras para o `CqrsModule.forRoot`, mais a que só o CQSRS entende
 * (`subscriptionPublisher`).
 *
 * Além do bus, ele fornece o par que faz as subscriptions funcionarem num sistema distribuído: o
 * `RemoteEventBus` (o que aconteceu em outro processo) e o `EventStream` (o local mais o remoto, que
 * é o que um `@SubscriptionHandler` escuta). Num processo só, o `EventStream` é o próprio `EventBus`.
 *
 * O bootstrap é o mesmo padrão do `CqrsModule`: no `onApplicationBootstrap`, o explorer varre os
 * providers atrás dos `@SubscriptionHandler` e os registra no bus. Fica *depois* do registro de
 * commands, queries, events e sagas, porque o `CqsrsModule` importa o `CqrsModule` — e um módulo é
 * inicializado depois do que ele importa.
 *
 * ```ts
 * @Module({ imports: [CqsrsModule.forRoot()], providers: [OnPostUpdatedSubscriptionHandler] })
 * export class AppModule {}
 * ```
 *
 * `forRoot` e `forRootAsync` são as portas de entrada: importar a classe `CqsrsModule` crua dá o
 * `SubscriptionBus` sem os buses do CQRS.
 */
@Module({
  providers: [SubscriptionBus, SubscriptionExplorerService, RemoteEventBus, EventStream],
  exports: [SubscriptionBus, RemoteEventBus, EventStream],
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
   * O mesmo, com as opções resolvidas de forma assíncrona — para quando o publisher (de eventos, de
   * subscriptions) depende de algo que só existe em runtime: um `ConfigService`, uma conexão.
   *
   * ```ts
   * CqsrsModule.forRootAsync({
   *   imports: [ConfigModule],
   *   inject: [ConfigService],
   *   useFactory: (config: ConfigService) => ({ subscriptionPublisher: new RedisSubscriptionPubSub(config.get('REDIS_URL')) }),
   * })
   * ```
   *
   * A montagem tem uma sutileza que vale o parágrafo: as opções são resolvidas **num módulo só**
   * ({@link CqsrsOptionsModule}), e tanto o `CqsrsModule` quanto o `CqrsModule` embaixo consomem
   * dali. O `CqrsModule.forRootAsync` recebe uma factory que apenas repassa o que já foi resolvido —
   * então a factory de quem chama roda uma vez, e não duas. É o mesmo objeto de módulo dinâmico nas
   * duas listas de `imports`: o Nest identifica um módulo dinâmico pelo par (classe, metadata), então
   * as duas referências são o mesmo módulo, com uma instância só.
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
