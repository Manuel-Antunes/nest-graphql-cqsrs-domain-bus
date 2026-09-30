import type { AgentExecutor, TaskStore } from '@a2a-js/sdk/server';
import { Injectable, Module } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { A2aModule } from './a2a.module';
import { A2aRegistry } from './a2a.registry';
import { A2aAgent } from './a2a-agent.decorator';
import { A2aModuleOptions } from './a2a-module.options';

@A2aAgent({
  id: 'module-agent',
  name: 'Module Agent',
  skills: [{ id: 'talk', name: 'Talk', description: 'Talks.' }],
})
@Injectable()
class ModuleAgent implements A2aAgent {
  readonly executor: AgentExecutor = {
    execute: async () => undefined,
    cancelTask: async () => undefined,
  };
  readonly taskStore = {} as TaskStore;
}

@Module({ providers: [ModuleAgent], exports: [ModuleAgent] })
class AgentsModule {}

const card = {
  name: 'Agents',
  description: 'The agents this server hosts.',
  version: '1.0.0',
} as A2aModuleOptions['card'];

describe('A2aModule', () => {
  it('hosts the agents it is registered with', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        A2aModule.register({
          card,
          baseUrl: 'http://agents.test',
          agentProviders: [ModuleAgent],
          allowAnonymous: true,
        }),
      ],
    }).compile();
    await moduleRef.init();

    expect(moduleRef.get(A2aRegistry).getAgentCard().name).toBe('Module Agent');
    expect(moduleRef.get(A2aModuleOptions).allowAnonymous).toBe(true);
    await moduleRef.close();
  });

  it('builds its options from a factory, keeping the static base path', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        AgentsModule,
        A2aModule.registerAsync({
          imports: [AgentsModule],
          basePath: 'agents',
          useFactory: () => ({
            card,
            baseUrl: 'http://agents.test',
            agentProviders: [ModuleAgent],
            allowAnonymous: true,
          }),
        }),
      ],
    }).compile();
    await moduleRef.init();

    expect(moduleRef.get(A2aModuleOptions).basePath).toBe('agents');
    expect(
      moduleRef
        .get(A2aRegistry)
        .getAgentCard()
        .supportedInterfaces.map((iface) => iface.url),
    ).toEqual([
      'http://agents.test/agents/v1/jsonrpc',
      'http://agents.test/agents/rest',
    ]);
    await moduleRef.close();
  });
});
