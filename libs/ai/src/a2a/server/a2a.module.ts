import {
  type DynamicModule,
  Inject,
  type MiddlewareConsumer,
  Module,
  type NestModule,
  RequestMethod,
} from '@nestjs/common';

import { A2aRegistry } from './a2a.registry';
import {
  type A2aAsyncModuleOptions,
  A2aModuleOptions,
} from './a2a-module.options';
import { A2aProtocolMiddleware } from './a2a-protocol.middleware';

@Module({})
export class A2aModule implements NestModule {
  constructor(
    @Inject(A2aModuleOptions) private readonly options: A2aModuleOptions,
  ) {}

  configure(consumer: MiddlewareConsumer): void {
    const basePath = this.options.basePath ?? 'a2a';
    consumer
      .apply(A2aProtocolMiddleware)
      .forRoutes({ path: `${basePath}/*path`, method: RequestMethod.ALL });
  }

  static register(options: A2aModuleOptions): DynamicModule {
    return {
      module: A2aModule,
      providers: [
        { provide: A2aModuleOptions, useValue: options },
        A2aRegistry,
        A2aProtocolMiddleware,
        ...(options.agentProviders ?? []),
      ],
      exports: [A2aRegistry, A2aModuleOptions],
    };
  }

  static registerAsync(options: A2aAsyncModuleOptions): DynamicModule {
    const basePath = options.basePath ?? 'a2a';
    return {
      module: A2aModule,
      imports: options.imports ?? [],
      providers: [
        {
          provide: A2aModuleOptions,
          inject: options.inject ?? [],
          useFactory: async (
            ...args: unknown[]
          ): Promise<A2aModuleOptions> => ({
            ...(await options.useFactory(...args)),
            basePath,
          }),
        },
        A2aRegistry,
        A2aProtocolMiddleware,
      ],
      exports: [A2aRegistry, A2aModuleOptions],
    };
  }
}
