import { type DynamicModule, Module } from '@nestjs/common';

import {
  type AgentCoreA2aAsyncOptions,
  AgentCoreA2aOptions,
} from './agentcore-a2a.options';
import { AgentCoreA2aServer } from './agentcore-a2a.server';

@Module({})
export class AgentCoreA2aModule {
  static registerAsync(options: AgentCoreA2aAsyncOptions): DynamicModule {
    return {
      module: AgentCoreA2aModule,
      imports: options.imports ?? [],
      providers: [
        {
          provide: AgentCoreA2aOptions,
          inject: options.inject ?? [],
          useFactory: options.useFactory,
        },
        AgentCoreA2aServer,
      ],
      exports: [AgentCoreA2aServer],
    };
  }
}
