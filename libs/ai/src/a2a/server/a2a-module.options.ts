import type { AgentCard } from '@a2a-js/sdk';
import type { User } from '@a2a-js/sdk/server';
import type { FactoryProvider, ModuleMetadata, Type } from '@nestjs/common';

import type { A2aAgent } from './a2a-agent.decorator';

export type A2aCardDefaults = Omit<
  AgentCard,
  'skills' | 'supportedInterfaces'
> & {
  supportedInterfaces?: AgentCard['supportedInterfaces'];
};

export type A2aUserResolver = (
  headers: Record<string, string | string[] | undefined>,
) => Promise<User | undefined>;

export abstract class A2aModuleOptions {
  declare readonly card?: Partial<A2aCardDefaults>;
  declare readonly basePath?: string;
  declare readonly baseUrl?: string;
  declare readonly agentProviders?: Type<A2aAgent>[];
  declare readonly resolveUser?: A2aUserResolver;
  declare readonly allowAnonymous?: boolean;
}

export type A2aAsyncModuleOptions = Pick<ModuleMetadata, 'imports'> &
  Pick<
    FactoryProvider<A2aModuleOptions | Promise<A2aModuleOptions>>,
    'useFactory' | 'inject'
  > & {
    basePath?: string;
  };
