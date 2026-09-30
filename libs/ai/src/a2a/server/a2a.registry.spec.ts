import { A2A_PROTOCOL_VERSION, type AgentCard } from '@a2a-js/sdk';
import type { AgentExecutor, TaskStore } from '@a2a-js/sdk/server';
import type { ModuleRef } from '@nestjs/core';
import { describe, expect, it } from 'vitest';

import { AgentExtensions } from '../domain/agent-extensions';
import { A2aRegistry, UnknownAgentReferenceError } from './a2a.registry';
import { A2aAgent } from './a2a-agent.decorator';
import type { A2aModuleOptions } from './a2a-module.options';

/**
 * The agent card, as this agent actually publishes it.
 *
 * A test rather than a `curl` on purpose: the card is the contract every client
 * reads before it says anything, and a shape assertion that only runs when
 * someone remembers to run it is not a contract. It also lets this cover the
 * fields whose ABSENCE matters — a `curl` can show what is there, but nobody
 * eyeballs a 3 KB JSON for a `kind` that should not be.
 */

/** Somewhere for tasks to live. Nothing here ever reads from it. */
const TASK_STORE = {} as TaskStore;

/**
 * An executor that can run a turn and nothing else.
 *
 * Deliberately NOT a LangChain agent. That the registry can register this at all
 * is the point of the refactor — deriving a task store from a graph's
 * `store`/`checkpointer` is `ReactAgentExecutor`'s business, not the protocol
 * layer's, and an agent built on anything else registers identically.
 */
function stubExecutor(): AgentExecutor {
  return {
    async execute() {
      /* no turn is ever run in these tests */
    },
    async cancelTask() {
      /* nor cancelled */
    },
  };
}

@A2aAgent({
  id: 'test-agent',
  skills: [
    {
      id: 'test-skill',
      name: 'Test Skill',
      description: 'A skill under test.',
      tags: ['test'],
    },
  ],
})
class TestAgent implements A2aAgent {
  readonly executor = stubExecutor();
  readonly taskStore = TASK_STORE;
}

/**
 * A card that asks for something, because the registry refuses to boot an agent
 * that refuses anonymous callers while declaring no way to authenticate — the
 * two halves of one statement, see `assertDiscoverable`.
 */
const SECURITY = {
  securitySchemes: {
    oauth: {
      scheme: {
        $case: 'oauth2SecurityScheme',
        value: {
          description: 'test',
          oauth2MetadataUrl: 'https://issuer.test/.well-known/x',
          flows: {
            flow: {
              $case: 'authorizationCode',
              value: {
                authorizationUrl: 'https://issuer.test/authorize',
                tokenUrl: 'https://issuer.test/token',
                refreshUrl: 'https://issuer.test/token',
                pkceRequired: true,
                scopes: { openid: 'id' },
              },
            },
          },
        },
      },
    },
  },
  securityRequirements: [{ schemes: { oauth: { list: ['openid'] } } }],
};

async function buildRegistry(
  overrides: Partial<A2aModuleOptions['card']> = {},
  registryOverrides: Partial<A2aModuleOptions> = {},
): Promise<A2aRegistry> {
  const options = {
    basePath: 'a2a',
    baseUrl: 'https://agent.test',
    agentProviders: [TestAgent],
    ...registryOverrides,
    card: {
      name: 'Test Agent',
      description: 'An agent under test.',
      version: '1.0.0',
      defaultInputModes: ['text'],
      defaultOutputModes: ['text'],
      ...SECURITY,
      ...overrides,
    },
  } as unknown as A2aModuleOptions;

  // Instantiates whichever provider it is handed, so a test can register more
  // than one agent without teaching the fake about each.
  const moduleRef = {
    get: (Provider: new () => unknown) => new Provider(),
    resolve: async (Provider: new () => unknown) => new Provider(),
  } as unknown as ModuleRef;

  const registry = new A2aRegistry(options, moduleRef);
  await registry.onModuleInit();
  return registry;
}

async function buildCard(
  overrides: Partial<A2aModuleOptions['card']> = {},
  registryOverrides: Partial<A2aModuleOptions> = {},
): Promise<AgentCard> {
  const registry = await buildRegistry(overrides, registryOverrides);
  return registry.getAgentCard();
}

describe('the published agent card', () => {
  it('advertises only v1.0 interfaces', async () => {
    const card = await buildCard();

    expect(card.supportedInterfaces.length).toBeGreaterThan(0);
    for (const iface of card.supportedInterfaces) {
      expect(iface.protocolVersion).toBe(A2A_PROTOCOL_VERSION);
    }
    // A declared 0.3 interface would be a promise this hard cut deliberately
    // does not keep.
    expect(
      card.supportedInterfaces.some((i) => i.protocolVersion === '0.3'),
    ).toBe(false);
  });

  it('offers JSON-RPC and HTTP+JSON, JSON-RPC first', async () => {
    const card = await buildCard();
    // The first entry is the preferred one, and it is what a credential ends up
    // bound to — `agentOriginOf` reads exactly this.
    expect(card.supportedInterfaces[0].protocolBinding).toBe('JSONRPC');
    expect(card.supportedInterfaces.map((i) => i.protocolBinding)).toContain(
      'HTTP+JSON',
    );
  });

  it('carries no pre-1.0 field', async () => {
    const card = await buildCard();
    const raw = JSON.parse(JSON.stringify(card));

    // v1.0 replaced these (spec §A.2.1/§A.2.2). Their PRESENCE is the
    // regression, which is why absence is asserted rather than eyeballed.
    expect(raw).not.toHaveProperty('url');
    expect(raw).not.toHaveProperty('additionalInterfaces');
    expect(raw).not.toHaveProperty('protocolVersion');
    expect(raw).not.toHaveProperty('supportsExtendedAgentCard');
    expect(raw).not.toHaveProperty('security');
    expect(JSON.stringify(raw)).not.toContain('"kind"');
  });
});

describe('an agent that could never be called', () => {
  /**
   * The card and the surface are two halves of one statement, and this is what
   * happens when they disagree. It is not hypothetical: this deployment shipped
   * exactly this gap between making the middleware fail closed and declaring the
   * OAuth scheme, and nothing failed until a client tried to talk.
   */
  it('refuses to boot when it demands a credential it never names', async () => {
    await expect(
      buildCard({ securitySchemes: {}, securityRequirements: [] } as never),
    ).rejects.toThrow(/declares no way to authenticate/);
  });

  it('refuses when a scheme is declared but nothing selects it', async () => {
    // OpenAPI semantics: schemes are a catalogue, `securityRequirements` is what
    // is actually asked for. A catalogue nobody reads from requires nothing.
    await expect(
      buildCard({ securityRequirements: [] } as never),
    ).rejects.toThrow(/declares no way to authenticate/);
  });

  it('allows a bare card when the agent really is open', async () => {
    const card = await buildCard(
      { securitySchemes: {}, securityRequirements: [] } as never,
      { allowAnonymous: true },
    );

    expect(card.name).toBe('Test Agent');
  });

  it('puts every optional feature in capabilities', async () => {
    const card = await buildCard();

    expect(card.capabilities?.streaming).toBe(true);
    // §A.2.2 moved this in from the top level — it is a capability, and now it
    // sits with the others.
    expect(card.capabilities).toHaveProperty('extendedAgentCard');
    expect(card.capabilities?.extensions?.length).toBeGreaterThan(0);
  });

  it('declares its extensions, all optional', async () => {
    const card = await buildCard();
    const uris = (card.capabilities?.extensions ?? []).map((e) => e.uri);

    expect(uris.sort()).toEqual(new AgentExtensions().uris().sort());
    // A client that understands none of them must still get a working plain
    // conversation, which `required: true` would forbid.
    expect(
      (card.capabilities?.extensions ?? []).every((e) => e.required === false),
    ).toBe(true);
  });

  it('gives every skill the securityRequirements v1.0 requires', async () => {
    const card = await buildCard();
    for (const skill of card.skills) {
      expect(skill.securityRequirements).toBeDefined();
    }
  });

  it('lets a caller override the interfaces without losing the extensions', async () => {
    // The extensions this agent supports are its own to state; a caller's card
    // fragment must not be able to quietly drop them.
    const card = await buildCard({
      capabilities: { streaming: true, extensions: [] },
    } as never);

    expect(card.capabilities?.extensions?.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// More than one agent on the same mount
// ============================================================================

/**
 * A server that hosts two agents.
 *
 * `LegalAgent` names a `referenceId`, so it is reachable at
 * `?referenceId=legal-agent`; `TestAgent` names none, so it stays the root — the
 * card every existing client already asks for, unchanged by the arrival of a
 * second agent. That backwards compatibility is the whole reason the reference
 * is optional rather than required.
 */
@A2aAgent({
  id: 'legal',
  name: 'Legal Agent',
  description: 'Reads the graph.',
  referenceId: 'legal-agent',
  skills: [
    {
      id: 'legal-search',
      name: 'Legal Search',
      description: 'Searches the knowledge graph.',
    },
  ],
})
class LegalAgent implements A2aAgent {
  readonly executor = stubExecutor();
  readonly taskStore = TASK_STORE;
}

describe('a server hosting more than one agent', () => {
  it('answers the root with the agent that claimed no reference', async () => {
    const registry = await buildRegistry(
      {},
      { agentProviders: [TestAgent, LegalAgent] },
    );

    expect(registry.getAgentCard().name).toBe('Test Agent');
    expect(registry.getAgentCard(null).name).toBe('Test Agent');
  });

  it('answers a reference with that agent’s own card', async () => {
    const registry = await buildRegistry(
      {},
      { agentProviders: [TestAgent, LegalAgent] },
    );
    const card = registry.getAgentCard('legal-agent');

    expect(card.name).toBe('Legal Agent');
    expect(card.description).toBe('Reads the graph.');
    expect(card.skills.map((s) => s.id)).toEqual(['legal-search']);
    // The shared half of the card still comes from the module: an agent states
    // what makes it different, not everything about itself.
    expect(card.version).toBe('1.0.0');
    expect(Object.keys(card.securitySchemes ?? {})).toContain('oauth');
  });

  it('routes each agent to its own executor', async () => {
    const registry = await buildRegistry(
      {},
      { agentProviders: [TestAgent, LegalAgent] },
    );

    expect(registry.getRequestHandler('legal-agent')).not.toBe(
      registry.getRequestHandler(),
    );
  });

  it('bakes the reference into the referenced card’s own URLs', async () => {
    // A client should never have to know the convention: it follows the URL the
    // card handed it. A card whose endpoints reach a DIFFERENT agent than the one
    // it describes is worse than no card at all.
    const registry = await buildRegistry(
      {},
      { agentProviders: [TestAgent, LegalAgent] },
    );

    for (const iface of registry.getAgentCard('legal-agent')
      .supportedInterfaces) {
      expect(iface.url).toContain(`${A2aRegistry.REFERENCE_PARAM}=legal-agent`);
    }
    // ...and the root agent's URLs stay exactly as they were.
    for (const iface of registry.getAgentCard().supportedInterfaces) {
      expect(iface.url).not.toContain(A2aRegistry.REFERENCE_PARAM);
    }
  });

  it('refuses a reference it does not host instead of serving the root', async () => {
    // Answering a typo'd reference with a different agent's card is how a client
    // ends up talking to the wrong agent and never finding out.
    const registry = await buildRegistry(
      {},
      { agentProviders: [TestAgent, LegalAgent] },
    );

    expect(() => registry.getAgentCard('nope')).toThrow(
      UnknownAgentReferenceError,
    );
    expect(() => registry.getAgentCard('nope')).toThrow(/legal-agent/);
  });

  it('refuses to boot when two agents claim the root', async () => {
    @A2aAgent({
      id: 'second-root',
      skills: [{ id: 's', name: 'S', description: 'S.' }],
    })
    class SecondRootAgent implements A2aAgent {
      readonly executor = stubExecutor();
      readonly taskStore = TASK_STORE;
    }

    await expect(
      buildRegistry({}, { agentProviders: [TestAgent, SecondRootAgent] }),
    ).rejects.toThrow(/claims the root agent card/);
  });

  it('refuses to boot when two agents claim the same reference', async () => {
    @A2aAgent({
      id: 'twin',
      referenceId: 'legal-agent',
      skills: [{ id: 's', name: 'S', description: 'S.' }],
    })
    class TwinAgent implements A2aAgent {
      readonly executor = stubExecutor();
      readonly taskStore = TASK_STORE;
    }

    await expect(
      buildRegistry({}, { agentProviders: [LegalAgent, TwinAgent] }),
    ).rejects.toThrow(/two agents claim/);
  });

  it('serves the single agent at the root even when it names a reference', async () => {
    const registry = await buildRegistry({}, { agentProviders: [LegalAgent] });

    expect(registry.getAgentCard().name).toBe('Legal Agent');
    expect(registry.getAgentCard('legal-agent').name).toBe('Legal Agent');
  });
});

describe('what an @A2aAgent class has to hand over', () => {
  it('refuses an agent where an executor was expected', async () => {
    // The mistake this refactor makes possible, caught where it is cheap. Before,
    // returning the graph was correct and the registry wrapped it; now the wrap
    // is the agent's, and a graph reaching the registry means it was forgotten.
    @A2aAgent({
      id: 'graph',
      skills: [{ id: 's', name: 'S', description: 'S.' }],
    })
    class ReturnsTheGraph implements A2aAgent {
      readonly executor = { store: {}, checkpointer: {} } as never;
      readonly taskStore = TASK_STORE;
    }

    await expect(
      buildRegistry({}, { agentProviders: [ReturnsTheGraph] }),
    ).rejects.toThrow(/is not an AgentExecutor/);
  });

  it('refuses an agent whose tasks have nowhere to live', async () => {
    @A2aAgent({
      id: 'storeless',
      skills: [{ id: 's', name: 'S', description: 'S.' }],
    })
    class Storeless implements A2aAgent {
      readonly executor = stubExecutor();
      readonly taskStore = undefined as never;
    }

    await expect(
      buildRegistry({}, { agentProviders: [Storeless] }),
    ).rejects.toThrow(/nowhere durable to live/);
  });

  it('skips a class that carries no declaration of its own', async () => {
    // `getOwnMetadata`, not `getMetadata`: a subclass inheriting its parent's card
    // would inherit the very `referenceId` that is supposed to tell them apart.
    class Undecorated extends TestAgent {}

    await expect(
      buildRegistry({}, { agentProviders: [Undecorated] }),
    ).rejects.toThrow(/No agents discovered/);
  });
});

// ============================================================================
// Skills the agent only knows about once it is built
// ============================================================================

describe('the skills a card ends up advertising', () => {
  /**
   * Which subagents a supervisor has is a DI decision, so a card written only
   * from the decorator keeps promising one fixed skill while the agent behind it
   * gains and loses whole capabilities. The class contributes what it actually
   * ended up with.
   */
  const CONTRIBUTED = [
    {
      id: 'consulta-juridica',
      name: 'consulta-juridica',
      description: 'Consulta processos.',
      tags: ['legal'],
    },
  ];

  @A2aAgent({
    id: 'contributing',
    skills: [{ id: 'declared', name: 'Declared', description: 'Always true.' }],
  })
  class ContributingAgent implements A2aAgent {
    readonly executor = stubExecutor();
    readonly taskStore = TASK_STORE;
    readonly skills = CONTRIBUTED;
  }

  it('publishes the declared skills and the contributed ones', async () => {
    const card = await buildCard({}, { agentProviders: [ContributingAgent] });

    expect(card.skills.map((s) => s.id)).toEqual([
      'declared',
      'consulta-juridica',
    ]);
  });

  it('fills in the v1.0 defaults for a contributed skill too', async () => {
    const card = await buildCard({}, { agentProviders: [ContributingAgent] });
    const contributed = card.skills.find((s) => s.id === 'consulta-juridica');

    expect(contributed?.inputModes).toEqual(['text']);
    expect(contributed?.securityRequirements).toEqual([]);
  });

  it('lets the declaration win when both name the same id', async () => {
    // A class may only ADD. Letting it redefine an id would mean the card
    // silently stops matching what the deployment wrote down.
    @A2aAgent({
      id: 'overriding',
      skills: [
        { id: 'same', name: 'From the declaration', description: 'Declared.' },
      ],
    })
    class OverridingAgent implements A2aAgent {
      readonly executor = stubExecutor();
      readonly taskStore = TASK_STORE;
      readonly skills = [
        { id: 'same', name: 'From the class', description: 'Contributed.' },
      ];
    }

    const card = await buildCard({}, { agentProviders: [OverridingAgent] });

    expect(card.skills).toHaveLength(1);
    expect(card.skills[0].name).toBe('From the declaration');
  });

  it('is happy with an agent that contributes nothing', async () => {
    // `TestAgent` has no `skills` member at all — the common case, and it must
    // not need one.
    const card = await buildCard();

    expect(card.skills.map((s) => s.id)).toEqual(['test-skill']);
  });
});
