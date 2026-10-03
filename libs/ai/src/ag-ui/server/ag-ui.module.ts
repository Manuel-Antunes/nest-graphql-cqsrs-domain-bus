import { type DynamicModule, Module } from '@nestjs/common';

import { AgUiRegistry } from './ag-ui.registry';
import {
  type AgUiAsyncModuleOptions,
  AgUiModuleOptions,
} from './ag-ui-module.options';

@Module({})
export class AgUiModule {
  static register(options: AgUiModuleOptions): DynamicModule {
    return {
      module: AgUiModule,
      providers: [
        { provide: AgUiModuleOptions, useValue: options },
        AgUiRegistry,
        ...(options.agentProviders ?? []),
      ],
      exports: [AgUiRegistry, AgUiModuleOptions],
    };
  }

  static registerAsync(options: AgUiAsyncModuleOptions): DynamicModule {
    return {
      module: AgUiModule,
      imports: [...(options.imports ?? [])],
      providers: [
        {
          provide: AgUiModuleOptions,
          inject: options.inject ?? [],
          useFactory: options.useFactory,
        },
        AgUiRegistry,
      ],
      exports: [AgUiRegistry, AgUiModuleOptions],
    };
  }
}
