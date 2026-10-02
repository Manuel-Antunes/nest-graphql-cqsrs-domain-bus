import {
  BedrockAgentCoreClient,
  CreateEventCommand,
  ListEventsCommand,
  Role,
} from '@aws-sdk/client-bedrock-agentcore';

import type { MemoryConfig } from '../config/memory.config';
import { ConversationMemory } from './conversation-memory';

const THREAD = { actorId: 'user-1', sessionId: 'context-1' };

const configOf = (memoryId: string | null): MemoryConfig => ({
  region: 'us-east-1',
  memoryId,
  recallLimit: 20,
});

describe('the conversations AgentCore Memory keeps', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reads back as turns in the order they happened', () => {
    const at = (second: number) =>
      new Date(Date.UTC(2026, 8, 30, 0, 0, second));

    expect(
      ConversationMemory.turnsOf([
        {
          eventTimestamp: at(2),
          payload: [
            {
              conversational: { role: Role.USER, content: { text: 'second' } },
            },
          ],
        },
        {
          eventTimestamp: at(1),
          payload: [
            { conversational: { role: Role.USER, content: { text: 'first' } } },
            {
              conversational: {
                role: Role.ASSISTANT,
                content: { text: 'answer' },
              },
            },
            { blob: {} },
          ],
        },
      ] as never),
    ).toEqual([
      { role: 'user', text: 'first' },
      { role: 'assistant', text: 'answer' },
      { role: 'user', text: 'second' },
    ]);
  });

  it('is off without a memory, and never calls AgentCore', async () => {
    const send = vi.spyOn(BedrockAgentCoreClient.prototype, 'send');
    const memory = new ConversationMemory(configOf(null));

    await memory.remember(THREAD, [{ role: 'user', text: 'hi' }]);

    expect(memory.enabled).toBe(false);
    expect(await memory.recall(THREAD)).toEqual([]);
    expect(send).not.toHaveBeenCalled();
  });

  it('records a turn as one event of the caller, in the conversation’s session', async () => {
    const send = vi
      .spyOn(BedrockAgentCoreClient.prototype, 'send')
      .mockResolvedValue({} as never);
    const memory = new ConversationMemory(configOf('memory-1'));

    await memory.remember(THREAD, [
      { role: 'user', text: 'hi' },
      { role: 'assistant', text: 'hello' },
    ]);

    const command = send.mock.calls[0][0] as CreateEventCommand;
    expect(command).toBeInstanceOf(CreateEventCommand);
    expect(command.input).toMatchObject({
      memoryId: 'memory-1',
      actorId: 'user-1',
      sessionId: 'context-1',
      payload: [
        { conversational: { role: Role.USER, content: { text: 'hi' } } },
        {
          conversational: { role: Role.ASSISTANT, content: { text: 'hello' } },
        },
      ],
    });
  });

  it('lists the session’s events with their payloads', async () => {
    const send = vi
      .spyOn(BedrockAgentCoreClient.prototype, 'send')
      .mockResolvedValue({ events: [] } as never);

    await new ConversationMemory(configOf('memory-1')).recall(THREAD);

    const command = send.mock.calls[0][0] as ListEventsCommand;
    expect(command).toBeInstanceOf(ListEventsCommand);
    expect(command.input).toEqual({
      memoryId: 'memory-1',
      actorId: 'user-1',
      sessionId: 'context-1',
      includePayloads: true,
      maxResults: 20,
    });
  });

  it('degrades to forgetting when AgentCore fails, rather than failing the turn', async () => {
    vi.spyOn(BedrockAgentCoreClient.prototype, 'send').mockRejectedValue(
      new Error('throttled'),
    );
    const memory = new ConversationMemory(configOf('memory-1'));

    await expect(
      memory.remember(THREAD, [{ role: 'user', text: 'hi' }]),
    ).resolves.toBeUndefined();
    await expect(memory.recall(THREAD)).resolves.toEqual([]);
  });
});
