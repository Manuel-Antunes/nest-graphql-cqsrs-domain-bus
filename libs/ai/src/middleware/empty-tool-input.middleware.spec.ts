import { AIMessage } from '@langchain/core/messages';

import { EmptyToolInputMiddleware } from './empty-tool-input.middleware';

const streamedCallWithNoInput = () =>
  new AIMessage({
    content: [
      {
        type: 'invalid_tool_call',
        id: 'call-1',
        name: 'ListPosts',
        args: '',
        error: 'Failed to parse tool call arguments as JSON',
      },
    ] as never,
    invalid_tool_calls: [
      {
        type: 'invalid_tool_call',
        id: 'call-1',
        name: 'ListPosts',
        args: '',
        error: 'Failed to parse tool call arguments as JSON',
      },
    ],
  });

describe('a tool called with no input, as a stream delivers it', () => {
  it('is a call with no arguments, not an invalid one', () => {
    const message = EmptyToolInputMiddleware.repair(streamedCallWithNoInput());

    expect(message.tool_calls).toEqual([
      { id: 'call-1', name: 'ListPosts', args: {}, type: 'tool_call' },
    ]);
    expect(message.invalid_tool_calls).toEqual([]);
    expect(message.content).toEqual([
      { type: 'tool_call', id: 'call-1', name: 'ListPosts', args: {} },
    ]);
  });

  it('leaves a call whose input is malformed invalid', () => {
    const message = new AIMessage({
      content: '',
      invalid_tool_calls: [
        {
          type: 'invalid_tool_call',
          id: 'call-2',
          name: 'CreatePost',
          args: '{"title": ',
          error: 'Failed to parse tool call arguments as JSON',
        },
      ],
    });

    const repaired = EmptyToolInputMiddleware.repair(message);

    expect(repaired.tool_calls).toEqual([]);
    expect(repaired.invalid_tool_calls).toHaveLength(1);
  });

  it('repairs one a stream left only in the content blocks', () => {
    const message = new AIMessage({
      content: [
        {
          type: 'invalid_tool_call',
          id: 'call-3',
          name: 'ListPosts',
          args: '',
          error: 'Failed to parse tool call arguments as JSON',
        },
      ] as never,
    });

    const repaired = EmptyToolInputMiddleware.repair(message);

    expect(repaired.tool_calls).toEqual([
      { id: 'call-3', name: 'ListPosts', args: {}, type: 'tool_call' },
    ]);
    expect(repaired.content).toEqual([
      { type: 'tool_call', id: 'call-3', name: 'ListPosts', args: {} },
    ]);
  });

  it('keeps the calls that were already valid', () => {
    const message = streamedCallWithNoInput();
    message.tool_calls = [
      { id: 'call-0', name: 'WhoAmI', args: { first: 5 }, type: 'tool_call' },
    ];

    expect(
      EmptyToolInputMiddleware.repair(message).tool_calls?.map(({ id }) => id),
    ).toEqual(['call-0', 'call-1']);
  });
});
