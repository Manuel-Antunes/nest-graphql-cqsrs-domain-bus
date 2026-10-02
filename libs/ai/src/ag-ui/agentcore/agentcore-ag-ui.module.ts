import { type DynamicModule, Module } from '@nestjs/common';

import {
  type AgentCoreAgUiAsyncOptions,
  AgentCoreAgUiOptions,
} from './agentcore-ag-ui.options';
import { AgentCoreAgUiServer } from './agentcore-ag-ui.server';

@Module({})
export class AgentCoreAgUiModule {
  static registerAsync(options: AgentCoreAgUiAsyncOptions): DynamicModule {
    return {
      module: AgentCoreAgUiModule,
      imports: options.imports ?? [],
      providers: [
        {
          provide: AgentCoreAgUiOptions,
          inject: options.inject ?? [],
          useFactory: options.useFactory,
        },
        AgentCoreAgUiServer,
      ],
      exports: [AgentCoreAgUiServer],
    };
  }
}
