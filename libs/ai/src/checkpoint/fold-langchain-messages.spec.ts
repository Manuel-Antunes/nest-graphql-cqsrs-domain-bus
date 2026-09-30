import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} from '@langchain/core/messages';
import { describe, expect, it } from 'vitest';

import { toParts } from '../domain/messages/langchain-message-parts';
import { foldLangChainMessages } from './fold-langchain-messages';

/**
 * The TypeScript half of a fold that also exists in SQL, as `chat_message_view`.
 *
 * These cases are deliberately the SAME ones the view encodes, because the two
 * implementations are kept honest by matching behaviour rather than by shared
 * code — there is no language both can share. A change here without the matching
 * change in the view (or vice versa) is the drift this file exists to catch.
 */

const THREAD = 'thread-1';

describe('what counts as a user-visible message', () => {
  it('keeps human and assistant turns', () => {
    const folded = foldLangChainMessages(
      [new HumanMessage('oi'), new AIMessage('olá')],
      THREAD,
    );

    expect(folded.map((m) => m.role)).toEqual(['USER', 'ASSISTANT']);
  });

  it('drops the system prompt', () => {
    const folded = foldLangChainMessages(
      [new SystemMessage('você é um agente'), new HumanMessage('oi')],
      THREAD,
    );

    expect(folded).toHaveLength(1);
    expect(folded[0].role).toBe('USER');
  });

  it('drops an assistant turn with neither text nor tool calls', () => {
    // Graph bookkeeping. Rendering an empty bubble for it is worse than
    // omitting it.
    expect(foldLangChainMessages([new AIMessage('')], THREAD)).toEqual([]);
  });

  it('never surfaces a ToolMessage as its own turn', () => {
    const folded = foldLangChainMessages(
      [
        new AIMessage({
          content: '',
          tool_calls: [{ id: 'c1', name: 'buscar', args: {} }],
        }),
        new ToolMessage({ tool_call_id: 'c1', content: 'achei' }),
      ],
      THREAD,
    );

    // One turn: the call, carrying its result.
    expect(folded).toHaveLength(1);
    expect(folded[0].role).toBe('ASSISTANT');
  });

  it('keeps position as the sort key, counting every message', () => {
    // `seq` is the ordinal in the raw channel, not in the filtered output —
    // the task-slice watermark is expressed in those same coordinates.
    const folded = foldLangChainMessages(
      [new SystemMessage('prompt'), new HumanMessage('oi')],
      THREAD,
    );

    expect(folded[0].seq).toBe(2);
  });

  it('falls back to a positional id when the message has none', () => {
    const folded = foldLangChainMessages([new HumanMessage('oi')], THREAD);
    expect(folded[0].id).toBe(`${THREAD}:1`);
  });
});

describe('the three outcomes a tool call actually has', () => {
  const callWith = (toolMessages: ToolMessage[]) =>
    foldLangChainMessages(
      [
        new AIMessage({
          content: '',
          tool_calls: [{ id: 'c1', name: 'buscar', args: { q: 'x' } }],
        }),
        ...toolMessages,
      ],
      THREAD,
    )[0].source.toolCalls?.[0];

  it('output-available when the tool returned', () => {
    expect(
      callWith([new ToolMessage({ tool_call_id: 'c1', content: 'achei' })]),
    ).toMatchObject({ state: 'output-available', output: 'achei' });
  });

  it('output-error when the tool failed', () => {
    expect(
      callWith([
        new ToolMessage({
          tool_call_id: 'c1',
          content: 'CPF duplicado',
          status: 'error',
        }),
      ]),
    ).toMatchObject({ state: 'output-error', output: 'CPF duplicado' });
  });

  it('input-available when no ToolMessage exists at all', () => {
    // The run died before the tool returned — a crash, a cancellation, a step
    // limit. Reading this as "still running" is what left failed imports
    // spinning forever in the UI.
    expect(callWith([])).toMatchObject({ state: 'input-available' });
  });

  it('matches a result to its call by id, not by position', () => {
    const folded = foldLangChainMessages(
      [
        new AIMessage({
          content: '',
          tool_calls: [
            { id: 'c1', name: 'a', args: {} },
            { id: 'c2', name: 'b', args: {} },
          ],
        }),
        new ToolMessage({ tool_call_id: 'c2', content: 'segundo' }),
        new ToolMessage({ tool_call_id: 'c1', content: 'primeiro' }),
      ],
      THREAD,
    );

    expect(folded[0].source.toolCalls).toMatchObject([
      { id: 'c1', output: 'primeiro' },
      { id: 'c2', output: 'segundo' },
    ]);
  });
});

describe('attachments', () => {
  const attachment = {
    url: 'https://cdn.example/a.pdf',
    mimeType: 'application/pdf',
    fileName: 'a.pdf',
  };

  it('lifts them out of additional_kwargs', () => {
    const message = new HumanMessage('segue');
    (
      message as unknown as { additional_kwargs: Record<string, unknown> }
    ).additional_kwargs = { attachments: [attachment] };

    const folded = foldLangChainMessages([message], THREAD);
    expect(folded[0].source.attachments).toEqual([attachment]);
  });

  it('keeps a message whose ONLY payload is an attachment', () => {
    // The user sent a file and typed nothing, so content is legitimately empty.
    // Without this the message is filtered out as bookkeeping and the file
    // disappears from the conversation on reload.
    const message = new HumanMessage('');
    (
      message as unknown as { additional_kwargs: Record<string, unknown> }
    ).additional_kwargs = { attachments: [attachment] };

    const folded = foldLangChainMessages([message], THREAD);
    expect(folded).toHaveLength(1);
    expect(toParts(folded[0].source)).toContainEqual(
      expect.objectContaining({ type: 'file', url: attachment.url }),
    );
  });

  it('ignores a non-array attachments key', () => {
    const message = new HumanMessage('oi');
    (
      message as unknown as { additional_kwargs: Record<string, unknown> }
    ).additional_kwargs = { attachments: 'nope' };

    expect(
      foldLangChainMessages([message], THREAD)[0].source.attachments,
    ).toEqual([]);
  });
});

describe('feeding toParts', () => {
  it('produces the AI-SDK part model the clients render', () => {
    const folded = foldLangChainMessages(
      [
        new AIMessage({
          content: 'Achei.',
          tool_calls: [{ id: 'c1', name: 'buscar', args: {} }],
        }),
        new ToolMessage({ tool_call_id: 'c1', content: '{"n":1}' }),
      ],
      THREAD,
    );

    // Tool parts before the text, as the clients render them.
    expect(toParts(folded[0].source).map((p) => p.type)).toEqual([
      'tool-invocation',
      'text',
    ]);
  });
});
