import type { Message } from '@ag-ui/client';
import { describe, expect, it } from 'vitest';

import { DELEGATION_TOOL, TheoTranscript } from './theo-transcript';

describe('the conversation with Theo, as the page shows it', () => {
  it('nests what the delegate said, and the result, under the delegation that asked for it', () => {
    const messages: Message[] = [
      { id: 'u1', role: 'user', content: 'Who am I?' },
      {
        id: 'a1',
        role: 'assistant',
        toolCalls: [
          {
            id: 'call-1',
            type: 'function',
            function: {
              name: DELEGATION_TOOL,
              arguments: JSON.stringify({
                agentName: 'Posts Manager',
                task: 'Tell me who I am.',
              }),
            },
          },
        ],
      },
      {
        id: 'call-1:answer',
        role: 'assistant',
        content: 'The caller is Ana.',
        subagentRunId: 'call-1',
      },
      {
        id: 't1',
        role: 'tool',
        toolCallId: 'call-1',
        content: 'The caller is Ana.',
      },
      { id: 'a2', role: 'assistant', content: 'You are Ana.' },
    ];

    expect(TheoTranscript.of(messages)).toEqual([
      { kind: 'user', id: 'u1', text: 'Who am I?' },
      {
        kind: 'delegation',
        id: 'call-1',
        agentName: 'Posts Manager',
        task: 'Tell me who I am.',
        said: 'The caller is Ana.',
        result: 'The caller is Ana.',
      },
      { kind: 'theo', id: 'a2', text: 'You are Ana.' },
    ]);
  });

  it('shows a delegation still in flight, and a call to any other tool', () => {
    const messages: Message[] = [
      {
        id: 'a1',
        role: 'assistant',
        content: 'Checking.',
        toolCalls: [
          {
            id: 'call-1',
            type: 'function',
            function: {
              name: DELEGATION_TOOL,
              arguments: '{"agentName":"Posts',
            },
          },
          {
            id: 'call-2',
            type: 'function',
            function: { name: 'show_toast', arguments: '{}' },
          },
        ],
      },
    ];

    expect(TheoTranscript.of(messages)).toEqual([
      { kind: 'theo', id: 'a1', text: 'Checking.' },
      {
        kind: 'delegation',
        id: 'call-1',
        agentName: 'an agent',
        task: '',
        said: '',
        result: undefined,
      },
      { kind: 'tool', id: 'call-2', name: 'show_toast', result: undefined },
    ]);
  });
});
