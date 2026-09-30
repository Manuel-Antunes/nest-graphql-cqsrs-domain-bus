import { TaskState } from '@a2a-js/sdk';
import { MemorySaver } from '@langchain/langgraph';
import {
  createAgent,
  createMiddleware,
  type ReactAgent,
  tool,
} from 'langchain';
import z from 'zod';

import { A2aPart } from '../domain/a2a-part';
import { AgentExtensions } from '../domain/agent-extensions';
import type {
  ToolCallPayload,
  ToolResultPayload,
} from '../domain/extensions/client-tools.extension';
import { A2aMiddleware } from './a2a.middleware';
import { ScriptedModel, type ScriptedTurn } from './testing/scripted-model';
import { TurnHarness } from './testing/turn-harness';

const extensions = new AgentExtensions();
const CLIENT_TOOLS_EXTENSION_URI = extensions.clientTools.uri;
const DEEP_AGENT_EXTENSION_URI = extensions.deepAgent.uri;

const lookup = tool(async ({ cpf }: { cpf: string }) => `encontrado: ${cpf}`, {
  name: 'get_exequente',
  description: 'consulta um exequente',
  schema: z.object({ cpf: z.string() }),
});

const failing = tool(
  async () => {
    throw new Error('CPF duplicado');
  },
  {
    name: 'import_spreadsheet',
    description: 'importa uma planilha',
    schema: z.object({}),
  },
);

const nothing = tool(async () => undefined, {
  name: 'silent_tool',
  description: 'returns nothing at all',
  schema: z.object({}),
});

const CLIENT_TOOL_DECLARATION = A2aPart.data({
  type: 'client-tools',
  tools: [
    {
      name: 'navigate_to_page',
      description: 'abre uma página',
      parameters: { type: 'object', properties: { path: { type: 'string' } } },
    },
  ],
});

function buildAgent(
  turns: ScriptedTurn[],
  tools: Parameters<typeof createAgent>[0]['tools'] = [lookup],
  extraMiddleware: Parameters<typeof createAgent>[0]['middleware'] = [],
): ReactAgent {
  return createAgent({
    model: new ScriptedModel(turns),
    tools,
    middleware: [A2aMiddleware.create(), ...(extraMiddleware ?? [])],
    checkpointer: new MemorySaver(),
  }) as unknown as ReactAgent;
}

const toolCalls = (payloads: readonly { type: string }[]) =>
  payloads.filter((p): p is ToolCallPayload => p.type === 'tool-call');
const toolResults = (payloads: readonly { type: string }[]) =>
  payloads.filter((p): p is ToolResultPayload => p.type === 'tool-result');

const BOTH_EXTENSIONS = [CLIENT_TOOLS_EXTENSION_URI, DEEP_AGENT_EXTENSION_URI];

describe('answer text', () => {
  it('streams every delta once into the answer artifact and closes it', async () => {
    const agent = buildAgent([{ text: ['Olá', ', ', 'tudo bem?'] }]);

    const turn = await TurnHarness.run({ agent, contextId: 'ctx-text' });

    expect(turn.artifactText).toBe('Olá, tudo bem?');
    expect(turn.artifactClosed).toBe(true);
    expect(turn.finalState).toBe(TaskState.TASK_STATE_COMPLETED);

    const texts = turn.bus.events
      .filter((e) => e.kind === 'statusUpdate')
      .flatMap((e) => e.data.status?.message?.parts ?? [])
      .filter((p) => p.content?.$case === 'text');
    expect(texts).toHaveLength(1);
  });

  it('keeps the answer whole across a tool round-trip', async () => {
    const agent = buildAgent([
      {
        text: ['Vou consultar. '],
        toolCalls: [{ id: 'c1', name: 'get_exequente', args: { cpf: '123' } }],
      },
      { text: ['Achei!'] },
    ]);

    const turn = await TurnHarness.run({ agent, contextId: 'ctx-two-steps' });

    expect(turn.artifactText).toBe('Vou consultar. Achei!');
    expect(turn.finalState).toBe(TaskState.TASK_STATE_COMPLETED);
  });

  it('keeps a sub-agent’s prose and tool calls out of the parent turn', async () => {
    const internal = tool(async () => 'segredo', {
      name: 'internal_lookup',
      description: 'só do especialista',
      schema: z.object({}),
    });

    const specialist = createAgent({
      model: new ScriptedModel([
        { toolCalls: [{ id: 'i1', name: 'internal_lookup', args: {} }] },
        { text: ['ANÁLISE INTERNA'] },
      ]),
      tools: [internal],
      name: 'specialist',
    });

    const delegate = tool(
      async () => {
        const result = await specialist.invoke({
          messages: [{ role: 'user', content: 'analise' }],
        });
        return result.messages.at(-1)?.text ?? '';
      },
      { name: 'task', description: 'delega', schema: z.object({}) },
    );

    const agent = buildAgent(
      [
        {
          text: ['Delegando. '],
          toolCalls: [{ id: 'd1', name: 'task', args: {} }],
        },
        { text: ['Pronto.'] },
      ],
      [delegate],
    );

    const turn = await TurnHarness.run({
      agent,
      contextId: 'ctx-subagent',
      extensions: BOTH_EXTENSIONS,
    });

    expect(turn.artifactText).toBe('Delegando. Pronto.');
    expect(turn.artifactText).not.toContain('ANÁLISE INTERNA');

    const names = toolCalls(turn.payloads).map((c) => c.toolName);
    expect(names).toEqual(['task']);
    expect(
      turn.payloads.some(
        (p) =>
          (p.type === 'tool-call' || p.type === 'tool-result') &&
          p.toolName === 'internal_lookup',
      ),
    ).toBe(false);
  });
});

describe('server tool events', () => {
  it('publishes each call once and its result once', async () => {
    const agent = buildAgent([
      {
        text: ['Consultando. '],
        toolCalls: [{ id: 'c1', name: 'get_exequente', args: { cpf: '123' } }],
      },
      { text: ['Feito.'] },
    ]);

    const turn = await TurnHarness.run({
      agent,
      contextId: 'ctx-server-tool',
      extensions: BOTH_EXTENSIONS,
    });

    const calls = toolCalls(turn.payloads);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      toolCallId: 'c1',
      toolName: 'get_exequente',
      args: { cpf: '123' },
      execution: 'server',
    });

    const results = toolResults(turn.payloads);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      toolCallId: 'c1',
      toolName: 'get_exequente',
      result: 'encontrado: 123',
    });
    expect(results[0].isError).toBeUndefined();
  });

  it('reports a failed tool as a failure, not as a done card', async () => {
    const agent = buildAgent(
      [
        { toolCalls: [{ id: 'f1', name: 'import_spreadsheet', args: {} }] },
        { text: ['Deu erro.'] },
      ],
      [failing],
    );

    const turn = await TurnHarness.run({
      agent,
      contextId: 'ctx-tool-error',
      extensions: BOTH_EXTENSIONS,
    });

    const [result] = toolResults(turn.payloads);
    expect(result).toBeDefined();
    expect(result.isError).toBe(true);
    expect(String(result.result)).toContain('CPF duplicado');
    expect(turn.finalState).toBe(TaskState.TASK_STATE_COMPLETED);
  });

  it('still reports a tool that legitimately returned nothing', async () => {
    const agent = buildAgent(
      [
        { toolCalls: [{ id: 's1', name: 'silent_tool', args: {} }] },
        { text: ['ok'] },
      ],
      [nothing],
    );

    const turn = await TurnHarness.run({
      agent,
      contextId: 'ctx-silent',
      extensions: BOTH_EXTENSIONS,
    });

    expect(toolResults(turn.payloads)).toHaveLength(1);
  });

  it('withholds tool payloads from a caller that negotiated no extension', async () => {
    const agent = buildAgent([
      { toolCalls: [{ id: 'c1', name: 'get_exequente', args: { cpf: '1' } }] },
      { text: ['ok'] },
    ]);

    const turn = await TurnHarness.run({ agent, contextId: 'ctx-plain' });

    expect(turn.payloads).toHaveLength(0);
    expect(turn.artifactText).toBe('ok');
    expect(turn.finalState).toBe(TaskState.TASK_STATE_COMPLETED);
  });

  it('never publishes after the terminal status', async () => {
    const agent = buildAgent([
      {
        text: ['a'],
        toolCalls: [{ id: 'c1', name: 'get_exequente', args: { cpf: '1' } }],
      },
      { text: ['b'] },
    ]);

    const turn = await TurnHarness.run({
      agent,
      contextId: 'ctx-ordering',
      extensions: BOTH_EXTENSIONS,
    });

    expect(turn.bus.publishedAfterTerminal).toEqual([]);
  });
});

describe('client tool events', () => {
  it('announces a browser tool once, under its real name, and awaits a result', async () => {
    const agent = buildAgent([
      {
        text: ['Abrindo. '],
        toolCalls: [
          { id: 'n1', name: 'navigate_to_page', args: { path: '/clientes' } },
        ],
      },
    ]);

    const turn = await TurnHarness.run({
      agent,
      contextId: 'ctx-client-tool',
      parts: [CLIENT_TOOL_DECLARATION],
      extensions: BOTH_EXTENSIONS,
    });

    const calls = toolCalls(turn.payloads);
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call.toolCallId).toBe('n1');
      expect(call.toolName).toBe('navigate_to_page');
      expect(call.execution).toBe('client');
    }

    expect(
      turn.payloads.some(
        (p) =>
          (p.type === 'tool-call' || p.type === 'tool-result') &&
          p.toolName === 'intercept_client_call',
      ),
    ).toBe(false);

    expect(toolResults(turn.payloads)).toHaveLength(0);

    expect(turn.finalState).toBe(TaskState.TASK_STATE_INPUT_REQUIRED);
  });

  it('resumes on the browser’s result without re-announcing the call', async () => {
    const agent = buildAgent([
      {
        toolCalls: [
          { id: 'n1', name: 'navigate_to_page', args: { path: '/clientes' } },
        ],
      },
      { text: ['Cheguei.'] },
    ]);

    const first = await TurnHarness.run({
      agent,
      contextId: 'ctx-resume',
      parts: [CLIENT_TOOL_DECLARATION],
      extensions: BOTH_EXTENSIONS,
    });
    expect(first.finalState).toBe(TaskState.TASK_STATE_INPUT_REQUIRED);

    const second = await TurnHarness.run({
      agent,
      contextId: 'ctx-resume',
      taskId: first.taskId,
      parts: [
        A2aPart.data({
          type: 'tool-result',
          toolCallId: 'n1',
          toolName: 'navigate_to_page',
          result: 'ok',
        }),
        CLIENT_TOOL_DECLARATION,
      ],
      extensions: BOTH_EXTENSIONS,
    });

    expect(second.artifactText).toBe('Cheguei.');
    expect(second.finalState).toBe(TaskState.TASK_STATE_COMPLETED);
    expect(second.payloads).toHaveLength(0);
  });

  it('does not offer client tools to a caller that did not activate them', async () => {
    const agent = buildAgent([{ text: ['Sem ferramentas.'] }]);

    const turn = await TurnHarness.run({
      agent,
      contextId: 'ctx-no-client-tools',
      parts: [CLIENT_TOOL_DECLARATION],
      extensions: [DEEP_AGENT_EXTENSION_URI],
    });

    expect(turn.finalState).toBe(TaskState.TASK_STATE_COMPLETED);
    expect(toolCalls(turn.payloads)).toHaveLength(0);
  });
});

describe('client/server classification', () => {
  it('treats a name the agent also owns server-side as a server call', async () => {
    const agent = buildAgent([
      {
        toolCalls: [{ id: 'c1', name: 'get_exequente', args: { cpf: '9' } }],
      },
      { text: ['ok'] },
    ]);

    const turn = await TurnHarness.run({
      agent,
      contextId: 'ctx-collision',
      parts: [
        A2aPart.data({
          type: 'client-tools',
          tools: [{ name: 'get_exequente', description: 'a page tool' }],
        }),
      ],
      extensions: BOTH_EXTENSIONS,
    });

    const [call] = toolCalls(turn.payloads);
    expect(call.execution).toBe('server');
    expect(toolResults(turn.payloads)).toHaveLength(1);
    expect(turn.finalState).toBe(TaskState.TASK_STATE_COMPLETED);
  });
});

describe('publish order', () => {
  it('interleaves text and tool activity in the order they happened', async () => {
    const agent = buildAgent([
      {
        text: ['Vou ', 'consultar. '],
        toolCalls: [{ id: 'c1', name: 'get_exequente', args: { cpf: '1' } }],
      },
      { text: ['Achei.'] },
    ]);

    const turn = await TurnHarness.run({
      agent,
      contextId: 'ctx-order',
      extensions: BOTH_EXTENSIONS,
    });

    expect(turn.timeline).toEqual([
      'text:Vou ',
      'text:consultar. ',
      'call:get_exequente:server',
      'result:get_exequente',
      'text:Achei.',
      'artifact-closed',
      'final:TASK_STATE_COMPLETED',
    ]);
  });

  it('announces one card per call id even if the model repeats itself', async () => {
    const agent = buildAgent([
      {
        text: ['a'],
        toolCalls: [
          { id: 'same', name: 'get_exequente', args: { cpf: '1' } },
          { id: 'same', name: 'get_exequente', args: { cpf: '1' } },
        ],
      },
      { text: ['b'] },
    ]);

    const turn = await TurnHarness.run({
      agent,
      contextId: 'ctx-repeat',
      extensions: BOTH_EXTENSIONS,
    });

    expect(turn.timeline.filter((entry) => entry.startsWith('call:'))).toEqual([
      'call:get_exequente:server',
    ]);
  });

  it('publishes each tool call id exactly once while the turn runs', async () => {
    const agent = buildAgent([
      {
        toolCalls: [
          { id: 'a1', name: 'get_exequente', args: { cpf: '1' } },
          { id: 'a2', name: 'get_exequente', args: { cpf: '2' } },
        ],
      },
      { text: ['ok'] },
    ]);

    const turn = await TurnHarness.run({
      agent,
      contextId: 'ctx-parallel',
      extensions: BOTH_EXTENSIONS,
    });

    const ids = toolCalls(turn.payloads).map((c) => c.toolCallId);
    expect(ids).toEqual(['a1', 'a2']);
    expect(
      new Set(toolResults(turn.payloads).map((r) => r.toolCallId)),
    ).toEqual(new Set(['a1', 'a2']));
  });
});

describe('tool result size', () => {
  it('clips a huge result and says that it did', async () => {
    const huge = 'x'.repeat(40_000);
    const bulky = tool(async () => huge, {
      name: 'read_file',
      description: 'lê um arquivo',
      schema: z.object({}),
    });

    const agent = buildAgent(
      [
        { toolCalls: [{ id: 'r1', name: 'read_file', args: {} }] },
        { text: ['li'] },
      ],
      [bulky],
    );

    const turn = await TurnHarness.run({
      agent,
      contextId: 'ctx-huge',
      extensions: BOTH_EXTENSIONS,
    });

    const [result] = toolResults(turn.payloads);
    const text = String(result.result);
    expect(text.length).toBeLessThan(huge.length);
    expect(text).toContain('truncado');
    expect(text).toContain('40000');
  });
});

describe('cancellation', () => {
  it('settles the task as canceled and stops publishing', async () => {
    const slow = tool(
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return 'tarde demais';
      },
      { name: 'slow_tool', description: 'demora', schema: z.object({}) },
    );

    const agent = buildAgent(
      [
        {
          text: ['Começando. '],
          toolCalls: [{ id: 's1', name: 'slow_tool', args: {} }],
        },
        { text: ['nunca chega'] },
      ],
      [slow],
    );

    const turn = await TurnHarness.run({
      agent,
      contextId: 'ctx-cancel',
      extensions: BOTH_EXTENSIONS,
      onStart: ({ executor, bus, taskId }) => {
        bus.onEvent = (event) => {
          const announced = (
            event.kind === 'statusUpdate'
              ? (event.data.status?.message?.parts ?? [])
              : []
          ).some((p) => p.content?.$case === 'data');
          if (announced) void executor.cancelTask(taskId, bus);
        };
      },
    });

    expect(turn.finalState).toBe(TaskState.TASK_STATE_CANCELED);
    expect(turn.bus.publishedAfterTerminal).toEqual([]);

    for (const result of toolResults(turn.payloads)) {
      expect(result.isError).toBe(true);
    }
    expect(turn.artifactText).not.toContain('nunca chega');
  });
});

describe('failure', () => {
  it('publishes a failed status when the graph blows up', async () => {
    const explode = createMiddleware({
      name: 'Explode',
      beforeModel: () => {
        throw new Error('modelo indisponível');
      },
    });

    const agent = buildAgent([{ text: ['nunca'] }], [lookup], [explode]);

    const turn = await TurnHarness.run({
      agent,
      contextId: 'ctx-failure',
      extensions: BOTH_EXTENSIONS,
    });

    expect(turn.finalState).toBe(TaskState.TASK_STATE_FAILED);
    expect(turn.bus.publishedAfterTerminal).toEqual([]);
  });
});
