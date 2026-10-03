import type { FactoryProvider, ModuleMetadata, Type } from '@nestjs/common';

import type { AgentContextFunction } from '../../agents/context/agent-context';
import type { AgUiAgent } from './ag-ui-agent.decorator';

export abstract class AgUiModuleOptions {
  declare readonly agentProviders?: Type<AgUiAgent>[];
  declare readonly context?: AgentContextFunction;
  declare readonly allowAnonymous?: boolean;
}

export type AgUiAsyncModuleOptions = Pick<ModuleMetadata, 'imports'> &
  Pick<
    FactoryProvider<AgUiModuleOptions | Promise<AgUiModuleOptions>>,
    'useFactory' | 'inject'
  >;
