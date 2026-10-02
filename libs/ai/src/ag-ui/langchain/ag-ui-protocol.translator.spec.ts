import { EventType } from '@ag-ui/core';
import type { ProtocolEvent } from '@langchain/langgraph';
import { describe, expect, it } from 'vitest';

import { AgUiEvents } from './ag-ui-events';
import { AgUiProtocolTranslator } from './ag-ui-protocol.translator';

let seq = 0;
const event = (
  method: string,
  data: unknown,
  { namespace = ['model_request:1'], node = 'model_request' } = {},
): ProtocolEvent =>
  ({
    type: 'event',
    seq: seq++,
    method,
    params: { namespace, node, timestamp: 0, data },
  }) as ProtocolEvent;

const typesOf = (translator: AgUiProtocolTranslator, events: ProtocolEvent[]) =>
  events.flatMap((each) => translator.translate(each));

describe('LangGraph’s stream, as AG-UI events', () => {
  it('starts a tool call whose id and name only arrive in a later delta, the way a provider streams them', () => {
    const translator = new AgUiProtocolTranslator();

    const events = typesOf(translator, [
      event('messages', { event: 'message-start', id: 'm1' }),
      event('messages', {
        event: 'content-block-start',
        index: 1,
        content: { type: 'tool_call_chunk', args: '' },
      }),
      event('messages', {
        event: 'content-block-delta',
        index: 1,
        delta: {
          type: 'block-delta',
          fields: {
            type: 'tool_call_chunk',
            id: 'c1',
            name: 'lookup',
            args: '{"q"',
          },
        },
      }),
      event('messages', {
        event: 'content-block-finish',
        index: 1,
        content: {
          type: 'tool_call',
          id: 'c1',
          name: 'lookup',
          args: { q: 'x' },
        },
      }),
      event('messages', { event: 'message-finish' }),
      event(
        'tools',
        {
          event: 'tool-error',
          tool_call_id: 'c1',
          message: 'lookup failed',
        },
        { namespace: ['tools:1'], node: undefined as never },
      ),
    ]);

    expect(events).toEqual([
      {
        type: EventType.TOOL_CALL_START,
        toolCallId: 'c1',
        toolCallName: 'lookup',
        parentMessageId: 'm1',
      },
      { type: EventType.TOOL_CALL_ARGS, toolCallId: 'c1', delta: '{"q":"x"}' },
      { type: EventType.TOOL_CALL_END, toolCallId: 'c1' },
      expect.objectContaining({
        type: EventType.TOOL_CALL_RESULT,
        toolCallId: 'c1',
        content: 'lookup failed',
      }),
    ]);
  });

  it('leaves out what a nested agent streams, and passes on the AG-UI events a tool wrote', () => {
    const translator = new AgUiProtocolTranslator();
    const progress = {
      type: EventType.CUSTOM,
      name: 'progress',
      value: 1,
    };

    const events = typesOf(translator, [
      event(
        'messages',
        {
          event: 'content-block-delta',
          index: 0,
          delta: { type: 'text-delta', text: 'inner' },
        },
        { namespace: ['tools:1', 'model_request:2'] },
      ),
      event(
        'custom',
        { payload: { [AgUiEvents.CHANNEL]: progress } },
        { namespace: [] },
      ),
      event('custom', { payload: { other: true } }, { namespace: [] }),
    ]);

    expect(events).toEqual([progress]);
  });

  it('reads a tool’s output however it arrives', () => {
    expect(AgUiProtocolTranslator.textOf('plain')).toBe('plain');
    expect(
      AgUiProtocolTranslator.textOf({
        lc: 1,
        kwargs: { content: [{ type: 'text', text: 'a' }, 'b'] },
      }),
    ).toBe('ab');
    expect(AgUiProtocolTranslator.textOf({ answer: 42 })).toBe('{"answer":42}');
  });
});
