import type { BaseMessage } from '@langchain/core/messages';
import { MemorySaver } from '@langchain/langgraph';
import { createDeepAgent } from 'deepagents';
import { humanInTheLoopMiddleware, type ReactAgent } from 'langchain';

import { foldLangChainMessages } from '../../checkpoint/fold-langchain-messages';
import { toParts } from '../../domain/messages/langchain-message-parts';
import type { ChatMessagePart } from '../../domain/messages/message-part.schema';
import { A2aPart } from '../domain/a2a-part';
import { AgentExtensions } from '../domain/agent-extensions';
import { A2aMiddleware } from './a2a.middleware';
import { ScriptedModel } from './testing/scripted-model';
import { TurnHarness } from './testing/turn-harness';

const extensions = new AgentExtensions();
const CLIENT_TOOLS_EXTENSION_URI = extensions.clientTools.uri;
const DEEP_AGENT_EXTENSION_URI = extensions.deepAgent.uri;

const CALL_ID = 'tool_rename_chat_abc';

const CLIENT_TOOLS = A2aPart.data({
  type: 'client-tools',
  tools: [
    {
      name: 'rename_chat',
      description: 'renomeia a conversa',
      parameters: { type: 'object', properties: { name: { type: 'string' } } },
    },
  ],
});

const EXTENSIONS = [CLIENT_TOOLS_EXTENSION_URI, DEEP_AGENT_EXTENSION_URI];

function buildAgent(): ReactAgent {
  return createDeepAgent({
    name: 'Yuri',
    model: new ScriptedModel([
      {
        toolCalls: [
          {
            id: CALL_ID,
            name: 'rename_chat',
            args: { name: 'Análise de imagem' },
          },
        ],
      },
      { text: ['Pronto!'] },
    ]),
    tools: [],
    middleware: [humanInTheLoopMiddleware({}), A2aMiddleware.create()],
    checkpointer: new MemorySaver(),
  }) as unknown as ReactAgent;
}

async function projectConversation(
  agent: ReactAgent,
  threadId: string,
): Promise<ChatMessagePart[]> {
  const state = (await agent.getState({
    configurable: { thread_id: threadId },
  })) as { values?: { messages?: BaseMessage[] } };

  return foldLangChainMessages(state.values?.messages ?? [], threadId).flatMap(
    (message) => toParts(message.source),
  );
}

const invocationsOf = (parts: ChatMessagePart[], toolName: string) =>
  parts.filter(
    (part) => part.type === 'tool-invocation' && part.toolName === toolName,
  );

describe('a client tool in the reopened conversation', () => {
  it('appears exactly once, before and after the browser answers', async () => {
    const agent = buildAgent();
    const threadId = 'ctx-projection';

    const first = await TurnHarness.run({
      agent,
      contextId: threadId,
      text: 'analise essa imagem',
      parts: [CLIENT_TOOLS],
      extensions: EXTENSIONS,
    });

    const parked = await projectConversation(agent, threadId);
    const parkedCalls = invocationsOf(parked, 'rename_chat');
    expect(parkedCalls).toHaveLength(1);
    expect(parkedCalls[0]).toMatchObject({
      toolCallId: CALL_ID,
      state: 'input-available',
    });
    expect(invocationsOf(parked, 'intercept_client_call')).toHaveLength(0);

    await TurnHarness.run({
      agent,
      contextId: threadId,
      taskId: first.taskId,
      parts: [
        A2aPart.data({
          type: 'tool-result',
          toolCallId: CALL_ID,
          toolName: 'rename_chat',
          result: '{"status":"renamed","name":"Análise de imagem"}',
        }),
        CLIENT_TOOLS,
      ],
      extensions: EXTENSIONS,
    });

    const settled = await projectConversation(agent, threadId);
    const settledCalls = invocationsOf(settled, 'rename_chat');
    expect(settledCalls).toHaveLength(1);
    expect(settledCalls[0]).toMatchObject({
      toolCallId: CALL_ID,
      toolName: 'rename_chat',
      input: { name: 'Análise de imagem' },
      state: 'output-available',
    });
  });

  it('keeps one tool call on the message the graph actually dispatches', async () => {
    const agent = buildAgent();
    const threadId = 'ctx-message-shape';

    await TurnHarness.run({
      agent,
      contextId: threadId,
      text: 'analise',
      parts: [CLIENT_TOOLS],
      extensions: EXTENSIONS,
    });

    const state = (await agent.getState({
      configurable: { thread_id: threadId },
    })) as { values?: { messages?: BaseMessage[] } };

    const ai = (state.values?.messages ?? []).filter(
      (message) => message.getType() === 'ai',
    );
    const withCalls = ai.filter(
      (message) =>
        ((message as unknown as { tool_calls?: unknown[] }).tool_calls ?? [])
          .length > 0,
    );

    expect(withCalls).toHaveLength(1);
    const toolCalls = (
      withCalls[0] as unknown as {
        tool_calls: { id?: string; name: string }[];
      }
    ).tool_calls;

    expect(toolCalls).toHaveLength(1);
    expect(toolCalls[0]).toMatchObject({
      id: CALL_ID,
      name: 'intercept_client_call',
    });

    const blocks = (
      Array.isArray(withCalls[0].content) ? withCalls[0].content : []
    ).filter((block) => (block as { type?: string })?.type === 'tool_call');

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({
      id: CALL_ID,
      name: 'intercept_client_call',
    });
  });
});
