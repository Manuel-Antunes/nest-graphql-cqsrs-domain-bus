import type { FactoryProvider, ModuleMetadata, Type } from '@nestjs/common';

import type { A2aAgent } from '../server/a2a-agent.decorator';

export abstract class AgentCoreA2aOptions {
  declare readonly agent?: Type<A2aAgent>;
  declare readonly referenceId?: string | null;
  declare readonly url?: string;
  declare readonly port?: number;
  declare readonly host?: string;
}

export type AgentCoreA2aAsyncOptions = Pick<ModuleMetadata, 'imports'> &
  Pick<
    FactoryProvider<AgentCoreA2aOptions | Promise<AgentCoreA2aOptions>>,
    'useFactory' | 'inject'
  >;
