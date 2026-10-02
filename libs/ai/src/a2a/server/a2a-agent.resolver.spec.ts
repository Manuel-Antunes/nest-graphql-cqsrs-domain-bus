import type {
  AgentExecutor,
  ExecutionEventBus,
  RequestContext,
  TaskStore,
  User,
} from '@a2a-js/sdk/server';
import type { ModuleRef } from '@nestjs/core';

import { Skill } from '../../domain/skill.entity';
import { A2aRegistry } from './a2a.registry';
import { A2aAgent } from './a2a-agent.decorator';
import { A2aAgentResolver } from './a2a-agent.resolver';
import { A2aCallers } from './a2a-callers';
import type { A2aModuleOptions } from './a2a-module.options';

const callers = new A2aCallers();
const seen: { caller?: string; turn: string }[] = [];
let builds = 0;
let failNextBuild = false;

const caller = (userName: string): User => ({
  isAuthenticated: true,
  userName,
});

const turn = (userName: string, id: string) =>
  ({
    context: { user: caller(userName) },
    taskId: id,
  }) as unknown as RequestContext;

const BUS = {} as ExecutionEventBus;

const FILING = Skill.create({
  name: 'filing',
  description: 'Files what it is given.',
  body: '# filing\n\nThe internal procedure, with the tool names it calls.',
  tags: ['files'],
  examples: ['File this.'],
});

const ARCHIVING = Skill.create({
  name: 'archiving',
  description: 'Archives what was filed.',
  body: '# archiving\n\nAnother internal procedure.',
});

@A2aAgent({
  id: 'lazy',
  name: 'Lazy agent',
  description: 'Builds its executor on the first turn.',
  card: { version: '2.0.0', defaultInputModes: ['text/plain'] },
  skills: [{ id: 'lazy', name: 'Lazy', description: 'Answers.' }, FILING],
})
class LazyAgent implements A2aAgent {
  readonly taskStore = {} as TaskStore;

  get skills(): Skill[] {
    return [FILING, ARCHIVING];
  }

  get card() {
    return {
      securitySchemes: {
        bearer: {
          scheme: {
            $case: 'httpAuthSecurityScheme' as const,
            value: { description: '', scheme: 'Bearer', bearerFormat: 'JWT' },
          },
        },
      },
      securityRequirements: [{ schemes: { bearer: { list: [] } } }],
    };
  }

  readonly executor = async (): Promise<AgentExecutor> => {
    builds += 1;
    const builtFor = callers.current()?.userName;
    if (failNextBuild) {
      failNextBuild = false;
      throw new Error(`no tools for ${builtFor}`);
    }
    return {
      execute: async (context) => {
        seen.push({
          caller: callers.current()?.userName,
          turn: `${context.taskId} built for ${builtFor}`,
        });
      },
      cancelTask: async () => undefined,
    };
  };
}

@A2aAgent({
  id: 'eager',
  referenceId: 'eager',
  skills: [{ id: 'eager', name: 'Eager', description: 'Answers.' }],
})
class EagerAgent implements A2aAgent {
  readonly taskStore = {} as TaskStore;
  readonly executor: AgentExecutor = {
    execute: async () => undefined,
    cancelTask: async () => undefined,
  };
}

class Unregistered implements A2aAgent {
  readonly taskStore = {} as TaskStore;
  readonly executor = EagerAgent.prototype.executor;
}

async function resolver(): Promise<A2aAgentResolver> {
  const options = {
    baseUrl: 'https://agent.test',
    allowAnonymous: true,
    agentProviders: [LazyAgent, EagerAgent],
  } as unknown as A2aModuleOptions;
  const moduleRef = {
    get: (Provider: new () => unknown) => new Provider(),
    resolve: async (Provider: new () => unknown) => new Provider(),
  } as unknown as ModuleRef;
  const registry = new A2aRegistry(options, moduleRef, callers);
  await registry.onModuleInit();
  return new A2aAgentResolver(registry);
}

describe('resolving an agent to what a host serves', () => {
  beforeEach(() => {
    seen.length = 0;
    builds = 0;
    failNextBuild = false;
  });

  it('finds it by its class, with the card its declaration and its instance both state', async () => {
    const { card } = (await resolver()).resolve(LazyAgent);

    expect(card.name).toBe('Lazy agent');
    expect(card.version).toBe('2.0.0');
    expect(card.defaultInputModes).toEqual(['text/plain']);
    expect(Object.keys(card.securitySchemes)).toEqual(['bearer']);
    expect(card.skills.map((skill) => skill.id)).toEqual([
      'lazy',
      'filing',
      'archiving',
    ]);
  });

  it('advertises a skill entity by what it says it does, never by its procedure', async () => {
    const { card } = (await resolver()).resolve(LazyAgent);
    const filing = card.skills.find((skill) => skill.id === 'filing');

    expect(filing).toMatchObject({
      name: 'filing',
      description: 'Files what it is given.',
      tags: ['files'],
      examples: ['File this.'],
    });
    expect(JSON.stringify(card)).not.toContain('internal procedure');
  });

  it('finds it by its reference too, and the root agent with none', async () => {
    const agents = await resolver();

    expect(agents.resolve('eager').card.skills[0].id).toBe('eager');
    expect(agents.resolve().card.name).toBe('Lazy agent');
  });

  it('refuses a class it was not given', async () => {
    const agents = await resolver();

    expect(() => agents.resolve(Unregistered)).toThrow(
      /Unregistered is not one of the agentProviders/,
    );
  });

  it('builds an executor handed over as a function once, on the first turn, as that turn’s caller', async () => {
    const { executor } = (await resolver()).resolve(LazyAgent);

    await callers.run(caller('ana'), () =>
      executor.execute(turn('ana', 't1'), BUS),
    );
    await executor.execute(turn('bruno', 't2'), BUS);

    expect(builds).toBe(1);
    expect(seen).toEqual([
      { caller: 'ana', turn: 't1 built for ana' },
      { caller: 'bruno', turn: 't2 built for ana' },
    ]);
  });

  it('builds it again on the next turn when a build fails', async () => {
    const { executor } = (await resolver()).resolve(LazyAgent);
    failNextBuild = true;

    await expect(executor.execute(turn('ana', 't1'), BUS)).rejects.toThrow(
      'no tools for ana',
    );
    await executor.execute(turn('bruno', 't2'), BUS);

    expect(builds).toBe(2);
    expect(seen).toEqual([{ caller: 'bruno', turn: 't2 built for bruno' }]);
  });
});
