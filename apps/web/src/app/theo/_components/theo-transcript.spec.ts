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

  it('puts the app a delegation brought back after it, and shows the delegate’s answer, not the operations', () => {
    const operations = [
      {
        version: 'v0.9',
        createSurface: { surfaceId: 's1', catalogId: 'theo' },
      },
    ];
    const messages: Message[] = [
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
                task: 'Let the person pick a post to edit.',
              }),
            },
          },
        ],
      },
      {
        id: 't1',
        role: 'tool',
        toolCallId: 'call-1',
        content: JSON.stringify({
          a2ui_operations: operations,
          answer: 'Pick the post on screen.',
        }),
      },
      {
        id: 'a2ui-surface-call-1',
        role: 'activity',
        activityType: 'a2ui-surface',
        content: { a2ui_operations: operations },
      },
      { id: 'a2', role: 'assistant', content: 'Pick it there.' },
    ];

    const entries = TheoTranscript.of(messages);

    expect(entries.map((entry) => entry.kind)).toEqual([
      'delegation',
      'activity',
      'theo',
    ]);
    expect(entries[0]).toMatchObject({ result: 'Pick the post on screen.' });
    expect(entries[1]).toMatchObject({
      id: 'a2ui-surface-call-1',
      message: { activityType: 'a2ui-surface' },
    });
  });

  it('draws a view Theo rendered itself without a marker for the drawing tool', () => {
    const messages: Message[] = [
      {
        id: 'a1',
        role: 'assistant',
        toolCalls: [
          {
            id: 'draw-1',
            type: 'function',
            function: { name: 'render_a2ui', arguments: '{}' },
          },
        ],
      },
      {
        id: 'a2ui-surface-draw-1',
        role: 'activity',
        activityType: 'a2ui-surface',
        content: { a2ui_operations: [] },
      },
    ];

    expect(TheoTranscript.of(messages).map((entry) => entry.kind)).toEqual([
      'activity',
    ]);
  });

  it('shows a web search with what Theo searched for, and the sources it found once it answered', () => {
    const search = (id: string, query: string): Message => ({
      id: `a-${id}`,
      role: 'assistant',
      toolCalls: [
        {
          id,
          type: 'function',
          function: {
            name: 'search_the_web',
            arguments: JSON.stringify({ query }),
          },
        },
      ],
    });
    const messages: Message[] = [
      search('search-1', 'AgentCore news'),
      {
        id: 't1',
        role: 'tool',
        toolCallId: 'search-1',
        content: [
          '[1] New AgentCore Runtime',
          'https://aws.amazon.com/new-agentcore-runtime/',
          'Published 2026-09-15',
          'The new runtime is generally available.',
          '',
          '[2] A page with no address',
          'Its passage.',
        ].join('\n'),
      },
      search('search-2', 'still searching'),
    ];

    expect(TheoTranscript.of(messages)).toEqual([
      {
        kind: 'search',
        id: 'search-1',
        query: 'AgentCore news',
        sources: [
          {
            title: 'New AgentCore Runtime',
            url: 'https://aws.amazon.com/new-agentcore-runtime/',
          },
        ],
      },
      {
        kind: 'search',
        id: 'search-2',
        query: 'still searching',
        sources: undefined,
      },
    ]);
    expect(
      TheoTranscript.sourcesOf('The web search found nothing for this.'),
    ).toEqual([]);
  });

  it('reads a plain answer, and a JSON one without operations, as it came', () => {
    expect(TheoTranscript.answerOf('You have two posts.')).toBe(
      'You have two posts.',
    );
    expect(TheoTranscript.answerOf('{"answer":"x"}')).toBe('{"answer":"x"}');
  });
});
