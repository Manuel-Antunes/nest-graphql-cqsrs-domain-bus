import type { FactoryProvider, ModuleMetadata, Type } from '@nestjs/common';

import type { AgentCallerResolver } from '../../agents/callers/agent-caller';
import type { AgUiAgent } from './ag-ui-agent.decorator';

export abstract class AgUiModuleOptions {
  declare readonly agentProviders?: Type<AgUiAgent>[];
  declare readonly resolveUser?: AgentCallerResolver;
  declare readonly allowAnonymous?: boolean;
}

export type AgUiAsyncModuleOptions = Pick<ModuleMetadata, 'imports'> &
  Pick<
    FactoryProvider<AgUiModuleOptions | Promise<AgUiModuleOptions>>,
    'useFactory' | 'inject'
  >;
