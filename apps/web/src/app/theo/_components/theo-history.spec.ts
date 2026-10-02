import { describe, expect, it } from 'vitest';

import { TheoHistory } from './theo-history';
import { TheoTranscript } from './theo-transcript';

describe('TheoHistory', () => {
  it('turns a conversation the chat API served into the messages the chat draws, delegation included', () => {
    const messages = TheoHistory.messagesOf([
      {
        id: 'u1',
        role: 'USER' as never,
        content: 'Who am I?',
        toolCalls: [],
        toolCallId: null,
      },
      {
        id: 'a1',
        role: 'ASSISTANT' as never,
        content: '',
        toolCalls: [
          {
            id: 'call-1',
            name: 'send_message_to_a2a_agent',
            arguments:
              '{"agentName":"Posts Manager","task":"Tell me who I am."}',
          },
        ],
        toolCallId: null,
      },
      {
        id: 't1',
        role: 'TOOL' as never,
        content: 'You are Ana.',
        toolCalls: [],
        toolCallId: 'call-1',
      },
      {
        id: 'a2',
        role: 'ASSISTANT' as never,
        content: 'You are Ana.',
        toolCalls: [],
        toolCallId: null,
      },
    ]);

    expect(TheoTranscript.of(messages)).toEqual([
      { kind: 'user', id: 'u1', text: 'Who am I?' },
      {
        kind: 'delegation',
        id: 'call-1',
        agentName: 'Posts Manager',
        task: 'Tell me who I am.',
        said: '',
        result: 'You are Ana.',
      },
      { kind: 'theo', id: 'a2', text: 'You are Ana.' },
    ]);
  });
});
