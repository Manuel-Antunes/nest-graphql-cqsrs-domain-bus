import { describe, expect, it } from 'vitest';

import { toParts } from './langchain-message-parts';

describe('toParts', () => {
  it('turns a folded tool call into one part, parsing JSON output', () => {
    expect(
      toParts({
        content: '',
        toolCalls: [
          {
            id: 'call-1',
            name: 'search_case',
            args: { cpf: '123' },
            state: 'output-available',
            output: '{"status":"Em andamento"}',
          },
        ],
      }),
    ).toEqual([
      {
        type: 'tool-invocation',
        toolCallId: 'call-1',
        toolName: 'search_case',
        input: { cpf: '123' },
        state: 'output-available',
        output: { status: 'Em andamento' },
      },
    ]);
  });

  it('keeps a non-JSON tool output as raw text', () => {
    const [part] = toParts({
      toolCalls: [
        { id: 'c', name: 't', args: {}, state: 'output-available', output: 'nao e json' },
      ],
    });
    expect(part).toMatchObject({ output: 'nao e json' });
  });

  it('defaults a call with no result to input-available', () => {
    const [part] = toParts({ toolCalls: [{ id: 'c', name: 'handoff', args: {} }] });
    expect(part).toMatchObject({ state: 'input-available', output: null });
  });

  it('reads multimodal content: text blocks concatenate, image_url becomes a file part', () => {
    expect(
      toParts({
        content: [
          { type: 'text', text: 'olha ' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } },
          { type: 'text', text: 'isso' },
        ],
      }),
    ).toEqual([
      { type: 'text', text: 'olha isso' },
      { type: 'file', url: 'data:image/png;base64,AAA', mediaType: 'image/png' },
    ]);
  });

  it('emits tool parts before the assistant text, as the clients render them', () => {
    const parts = toParts({
      content: 'Achei.',
      toolCalls: [{ id: 'c', name: 't', args: {}, state: 'output-available', output: '1' }],
    });
    expect(parts.map((p) => p.type)).toEqual(['tool-invocation', 'text']);
  });

  it('is idempotent over an already-shaped array', () => {
    const already = [{ type: 'text', text: 'oi' }];
    expect(toParts(already as never)).toBe(already);
  });

  it('yields no parts for an empty message', () => {
    expect(toParts({ content: '', toolCalls: [] })).toEqual([]);
  });

  describe('intercepted client calls', () => {
    it('reports the real tool, not the interceptor stub', () => {
      const [part] = toParts({
        toolCalls: [
          {
            id: 'call-1',
            name: 'intercept_client_call',
            args: {
              id: 'call-1',
              name: 'navigate_to_page',
              args: { path: '/clientes' },
              type: 'tool_call',
            },
            state: 'output-available',
            output: '{"ok":true}',
          },
        ],
      });

      expect(part).toEqual({
        type: 'tool-invocation',
        toolCallId: 'call-1',
        toolName: 'navigate_to_page',
        input: { path: '/clientes' },
        state: 'output-available',
        output: { ok: true },
      });
    });

    it('keeps the id the result was folded onto', () => {
      // The view joins the `ToolMessage` by the OUTER id; taking the envelope's
      // would orphan an output that has already been attached.
      const [part] = toParts({
        toolCalls: [
          {
            id: 'outer',
            name: 'intercept_client_call',
            args: { id: 'inner', name: 'do_thing', args: {} },
            state: 'output-available',
            output: 'done',
          },
        ],
      });

      expect(part).toMatchObject({ toolCallId: 'outer', output: 'done' });
    });

    it('preserves a client call that is still awaiting the browser', () => {
      const [part] = toParts({
        toolCalls: [
          {
            id: 'call-2',
            name: 'intercept_client_call',
            args: { id: 'call-2', name: 'read_page', args: {} },
          },
        ],
      });

      expect(part).toMatchObject({
        toolName: 'read_page',
        state: 'input-available',
        output: null,
      });
    });

    it('falls back to the stub when the envelope carries no tool name', () => {
      // Malformed is better rendered as the stub than as a nameless call.
      const [part] = toParts({
        toolCalls: [
          { id: 'c', name: 'intercept_client_call', args: { oops: true } },
        ],
      });

      expect(part).toMatchObject({
        toolName: 'intercept_client_call',
        input: { oops: true },
      });
    });

    it('leaves ordinary server tools untouched', () => {
      const [part] = toParts({
        toolCalls: [{ id: 'c', name: 'write_todos', args: { todos: [] } }],
      });

      expect(part).toMatchObject({
        toolName: 'write_todos',
        input: { todos: [] },
      });
    });
  });
});

/**
 * The file the user attached is theirs, so it belongs in the transcript. What
 * the middleware wrote ABOUT it (the `[Anexo: …]` marker, the analysis) does
 * not — that is prompt material, rendered per model call and never persisted
 * into `content`. The view lifts the attachment blocks out of
 * `additional_kwargs`; these pin what the UI gets.
 */
describe('toParts — attachments', () => {
  const attachment = {
    path: '/attachments/abc-file-0.png',
    fileName: 'IMG_8602.png',
    mimeType: 'image/png',
    url: 'https://cdn.example/tmp/file-analysis/abc-file-0.png',
  };

  it('emits a file part per attachment, after the user text', () => {
    expect(
      toParts({ content: 'Analise esse arquivo', attachments: [attachment] }),
    ).toEqual([
      { type: 'text', text: 'Analise esse arquivo' },
      {
        type: 'file',
        url: attachment.url,
        mediaType: 'image/png',
        filename: 'IMG_8602.png',
      },
    ]);
  });

  it('renders a file-only message — there is no text to fall back on', () => {
    // The user sent a file and typed nothing. `content` is legitimately empty,
    // so the attachment is the entire message.
    expect(toParts({ content: [], attachments: [attachment] })).toEqual([
      {
        type: 'file',
        url: attachment.url,
        mediaType: 'image/png',
        filename: 'IMG_8602.png',
      },
    ]);
  });

  it('skips an attachment whose bytes never landed', () => {
    // No URL means the put failed. A `file` part without one renders as a
    // broken image, which reads as "the system lost my file" rather than
    // "the upload failed" — and the marker already told the agent to ask for
    // a resend.
    expect(
      toParts({ content: 'oi', attachments: [{ ...attachment, url: undefined }] }),
    ).toEqual([{ type: 'text', text: 'oi' }]);
  });

  it('does not ALSO emit the inline data-URL copy of the same image', () => {
    // With `inlineImageDataUri` the model keeps a `data:` copy in `content`.
    // Rendering both would double every image; the hosted URL is the better of
    // the two (bytes instead of megabytes, and it survives a reload).
    const parts = toParts({
      content: [
        { type: 'text', text: 'olha' },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
      ],
      attachments: [attachment],
    });

    expect(parts.filter((p) => p.type === 'file')).toEqual([
      {
        type: 'file',
        url: attachment.url,
        mediaType: 'image/png',
        filename: 'IMG_8602.png',
      },
    ]);
  });

  it('still renders inline images when there are no ingested attachments', () => {
    const parts = toParts({
      content: [
        { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
      ],
    });

    expect(parts).toEqual([
      { type: 'file', url: 'data:image/png;base64,AAAA', mediaType: 'image/png' },
    ]);
  });
});
