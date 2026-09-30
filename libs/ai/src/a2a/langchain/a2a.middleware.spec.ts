import { SystemMessage, ToolMessage } from '@langchain/core/messages';
import { GraphInterrupt } from '@langchain/langgraph';

import { AgentExtensions } from '../domain/agent-extensions';
import { A2aMiddleware } from './a2a.middleware';

const extensions = new AgentExtensions();
const CLIENT_TOOLS_EXTENSION_URI = extensions.clientTools.uri;
const BROWSER_CONTEXT_EXTENSION_URI = extensions.browserContext.uri;
const a2aMiddleware = A2aMiddleware.create();

const wrapToolCall = a2aMiddleware.wrapToolCall as (
  request: unknown,
  handler: (request: unknown) => Promise<unknown>,
) => Promise<unknown>;

const request = (name: string) => ({
  toolCall: { id: 'tc-1', name, args: {}, type: 'tool_call' as const },
});

describe('A2aMiddleware.wrapToolCall', () => {
  it('converts a failing tool into a ToolMessage instead of killing the run', async () => {
    const result = (await wrapToolCall(
      request('import-legal-spreadsheet'),
      () => {
        throw new Error(
          "MCP tool 'import-legal-spreadsheet' returned an error: CPF duplicado",
        );
      },
    )) as ToolMessage;

    expect(result).toBeInstanceOf(ToolMessage);
    expect(result.content).toContain('CPF duplicado');
    expect(result.tool_call_id).toBe('tc-1');
    expect(result.name).toBe('import-legal-spreadsheet');
  });

  it('stamps `status: error` — `chat_message_view` reads it to render the failure', async () => {
    const result = (await wrapToolCall(request('anything'), () => {
      throw new Error('boom');
    })) as ToolMessage;

    expect(result.status).toBe('error');
  });

  it('lets a graph interrupt bubble up — that is control flow, not a failure', async () => {
    await expect(
      wrapToolCall(request('intercept_client_call'), () => {
        throw new GraphInterrupt([]);
      }),
    ).rejects.toBeInstanceOf(GraphInterrupt);
  });

  it('lets a cancellation bubble up', async () => {
    await expect(
      wrapToolCall(request('slow-tool'), () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        throw error;
      }),
    ).rejects.toThrow('aborted');
  });

  it('passes a successful tool through untouched', async () => {
    const output = new ToolMessage({ content: 'ok', tool_call_id: 'tc-1' });
    await expect(
      wrapToolCall(request('happy'), async () => output),
    ).resolves.toBe(output);
  });
});

describe('A2aMiddleware.wrapModelCall — client-call envelope ids', () => {
  const wrapModelCall = a2aMiddleware.wrapModelCall as (
    request: unknown,
    handler: (request: unknown) => Promise<unknown>,
  ) => Promise<{
    tool_calls?: { id?: string; name: string; args?: unknown }[];
  }>;

  const modelRequest = (
    activated: string[] = [CLIENT_TOOLS_EXTENSION_URI],
  ) => ({
    tools: [],
    systemMessage: undefined,
    runtime: {
      context: {
        a2a: {
          activatedExtensions: activated,
          clientTools: [
            {
              name: 'navigate_to_page',
              description: 'go somewhere',
              parameters: { type: 'object', properties: {} },
            },
          ],
        },
      },
    },
  });

  it('wraps a client tool call, keeping the model id on both halves', async () => {
    const result = await wrapModelCall(modelRequest(), async () => ({
      tool_calls: [
        {
          id: 'tool_navigate_to_page_abc',
          name: 'navigate_to_page',
          args: { path: '/clientes' },
          type: 'tool_call',
        },
      ],
    }));

    const call = result.tool_calls?.[0];
    expect(call?.name).toBe('intercept_client_call');
    expect(call?.id).toBe('tool_navigate_to_page_abc');
    expect((call?.args as { id: string } | undefined)?.id).toBe(
      'tool_navigate_to_page_abc',
    );
  });

  it('does not touch the call when the client-tools extension is not activated', async () => {
    const result = await wrapModelCall(
      modelRequest([]) as never,
      async () =>
        ({
          tool_calls: [
            {
              name: 'navigate_to_page',
              id: 'tool_navigate_to_page_abc',
              args: { path: '/x' },
              type: 'tool_call',
            },
          ],
        }) as never,
    );

    expect(result.tool_calls?.[0]?.name).toBe('navigate_to_page');
  });

  it('realigns an envelope the MODEL wrote itself onto the inner id', async () => {
    const result = await wrapModelCall(modelRequest(), async () => ({
      tool_calls: [
        {
          id: 'tool_intercept_client_call_xyz',
          name: 'intercept_client_call',
          args: {
            id: 'tool_navigate_to_page_abc',
            name: 'navigate_to_page',
            args: { path: '/clientes' },
            type: 'tool_call',
          },
          type: 'tool_call',
        },
      ],
    }));

    const call = result.tool_calls?.[0];
    expect(call?.name).toBe('intercept_client_call');
    expect(call?.id).toBe('tool_navigate_to_page_abc');
  });

  it('leaves an envelope with no inner id alone', async () => {
    const result = await wrapModelCall(modelRequest(), async () => ({
      tool_calls: [
        {
          id: 'tool_intercept_client_call_xyz',
          name: 'intercept_client_call',
          args: { name: 'navigate_to_page' },
          type: 'tool_call',
        },
      ],
    }));

    expect(result.tool_calls?.[0]?.id).toBe('tool_intercept_client_call_xyz');
  });
});

describe('A2aMiddleware.wrapModelCall — browser context', () => {
  const wrapModelCall = a2aMiddleware.wrapModelCall as (
    request: unknown,
    handler: (request: unknown) => Promise<unknown>,
  ) => Promise<unknown>;

  const CONTEXT = {
    type: 'browser-context' as const,
    current: {
      tabId: 1,
      url: 'https://app.example/clientes',
      title: 'Clientes',
      content: 'Ana Souza — 111.111.111-11',
      truncated: true,
    },
    others: [{ tabId: 2, url: 'https://docs.example/guia', title: 'Guia' }],
  };

  async function promptFor(activated: string[], browserContext?: unknown) {
    let seen = '';
    await wrapModelCall(
      {
        tools: [],
        systemMessage: undefined,
        runtime: {
          context: {
            a2a: { activatedExtensions: activated, browserContext },
          },
        },
      },
      async (request) => {
        seen =
          (request as { systemMessage?: SystemMessage }).systemMessage?.text ??
          '';
        return {};
      },
    );
    return seen;
  }

  it('tells the model what the user is looking at', async () => {
    const prompt = await promptFor([BROWSER_CONTEXT_EXTENSION_URI], CONTEXT);

    expect(prompt).toContain('## Contexto do navegador');
    expect(prompt).toContain('https://app.example/clientes');
    expect(prompt).toContain('Ana Souza');
    expect(prompt).toContain('https://docs.example/guia');
    expect(prompt).toContain('NÃO o conteúdo');
  });

  it('says so when the page was cut', async () => {
    expect(await promptFor([BROWSER_CONTEXT_EXTENSION_URI], CONTEXT)).toContain(
      'CORTADO',
    );
  });

  it('says nothing at all when the extension was not activated', async () => {
    const prompt = await promptFor([], CONTEXT);

    expect(prompt).not.toContain('Contexto do navegador');
    expect(prompt).not.toContain('app.example');
  });

  it('omits the section entirely when there is no context to give', async () => {
    const prompt = await promptFor([BROWSER_CONTEXT_EXTENSION_URI], {
      type: 'browser-context',
      others: [],
    });

    expect(prompt).not.toContain('Contexto do navegador');
  });
});

describe('A2aMiddleware.wrapModelCall — the system message', () => {
  const wrapModelCall = a2aMiddleware.wrapModelCall as (
    request: unknown,
    handler: (request: unknown) => Promise<unknown>,
  ) => Promise<unknown>;

  async function systemMessageFor(
    a2a: Record<string, unknown>,
    systemMessage = new SystemMessage('Você é um agente.'),
  ) {
    let seen: SystemMessage | undefined;
    await wrapModelCall(
      { tools: [], systemMessage, runtime: { context: { a2a } } },
      async (request) => {
        seen = (request as { systemMessage: SystemMessage }).systemMessage;
        return {};
      },
    );
    return seen;
  }

  it('appends the caller’s instructions after the agent’s own prompt', async () => {
    const seen = await systemMessageFor({
      activatedExtensions: [],
      clientInstructions: 'Responda em inglês.',
    });

    expect(seen?.text).toBe('Você é um agente.\n\nResponda em inglês.');
  });

  it('never mutates the system message it was handed, so nothing accumulates across calls', async () => {
    const original = new SystemMessage('Você é um agente.');

    await systemMessageFor(
      { activatedExtensions: [], clientInstructions: 'Responda em inglês.' },
      original,
    );
    const second = await systemMessageFor(
      { activatedExtensions: [], clientInstructions: 'Responda em inglês.' },
      original,
    );

    expect(original.text).toBe('Você é um agente.');
    expect(second?.text.match(/Responda em inglês/g)).toHaveLength(1);
  });

  it('says nothing about page tools to a caller without client tools', async () => {
    const seen = await systemMessageFor({
      activatedExtensions: [],
      clientTools: [{ name: 'navigate_to_page' }],
    });

    expect(seen?.text).toBe('Você é um agente.');
  });

  it('lists the page tools, and mounts them, for a caller with client tools', async () => {
    const clientToolNames = new Set<string>();
    let tools: { name: string }[] = [];
    let text = '';
    await wrapModelCall(
      {
        tools: [],
        systemMessage: new SystemMessage('Você é um agente.'),
        runtime: {
          context: {
            a2a: {
              activatedExtensions: [CLIENT_TOOLS_EXTENSION_URI],
              clientTools: [{ name: 'navigate_to_page', description: 'go' }],
              clientToolNames,
            },
          },
        },
      },
      async (request) => {
        const seen = request as {
          tools: { name: string }[];
          systemMessage: SystemMessage;
        };
        tools = seen.tools;
        text = seen.systemMessage.text;
        return {};
      },
    );

    expect(tools.map((tool) => tool.name)).toContain('navigate_to_page');
    expect(clientToolNames).toEqual(new Set(['navigate_to_page']));
    expect(text).toContain('## Ferramentas da página atual');
    expect(text).toContain('`navigate_to_page`: go');
  });

  it('withholds the envelope tool when no client tool is declared', async () => {
    let tools: { name: string }[] = [];
    await wrapModelCall(
      {
        tools: [{ name: 'intercept_client_call' }, { name: 'server_tool' }],
        systemMessage: new SystemMessage(''),
        runtime: {
          context: {
            a2a: { activatedExtensions: [CLIENT_TOOLS_EXTENSION_URI] },
          },
        },
      },
      async (request) => {
        tools = (request as { tools: { name: string }[] }).tools;
        return {};
      },
    );

    expect(tools.map((tool) => tool.name)).toEqual(['server_tool']);
  });
});
