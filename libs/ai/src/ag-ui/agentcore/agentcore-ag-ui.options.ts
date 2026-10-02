import type { FactoryProvider, ModuleMetadata, Type } from '@nestjs/common';

import type { AgUiAgent } from '../server/ag-ui-agent.decorator';

export abstract class AgentCoreAgUiOptions {
  declare readonly agent?: Type<AgUiAgent> | string;
  declare readonly port?: number;
  declare readonly host?: string;
}

export type AgentCoreAgUiAsyncOptions = Pick<ModuleMetadata, 'imports'> &
  Pick<
    FactoryProvider<AgentCoreAgUiOptions | Promise<AgentCoreAgUiOptions>>,
    'useFactory' | 'inject'
  >;
