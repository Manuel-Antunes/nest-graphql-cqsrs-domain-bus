import { A2aWire } from '../testing/a2a-wire';
import { A2aPart } from './a2a-part';
import { ChatMessageEncoder } from './chat-message-encoder';
import { ClientToolsExtension } from './extensions/client-tools.extension';

const encoder = new ChatMessageEncoder();
const clientTools = new ClientToolsExtension();

describe('ChatMessageEncoder', () => {
  it('encodes text and files', () => {
    const parts = encoder.encode([
      { type: 'text', text: 'segue o anexo' },
      {
        type: 'file',
        url: 'https://cdn.example/a.pdf',
        mediaType: 'application/pdf',
        filename: 'a.pdf',
      },
    ]);

    expect(parts).toHaveLength(2);
    expect(A2aPart.textOf(parts)).toBe('segue o anexo');
    expect(parts[1]).toMatchObject({
      mediaType: 'application/pdf',
      filename: 'a.pdf',
    });
    expect(A2aWire.keyPathsOf(parts, 'kind')).toEqual([]);
  });

  it('emits a finished call and its result as two client-tools payloads', () => {
    const parts = encoder.encode([
      {
        type: 'tool-invocation',
        toolCallId: 'c1',
        toolName: 't',
        input: { a: 1 },
        state: 'output-available',
        output: { ok: true },
      },
    ]);

    expect(parts.map((part) => clientTools.decode(part))).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'c1',
        toolName: 't',
        args: { a: 1 },
        execution: 'server',
      },
      {
        type: 'tool-result',
        toolCallId: 'c1',
        toolName: 't',
        result: { ok: true },
      },
    ]);
  });

  it('emits a call with no result when the run died before the tool returned', () => {
    const parts = encoder.encode([
      {
        type: 'tool-invocation',
        toolCallId: 'c1',
        toolName: 't',
        input: {},
        state: 'input-available',
      },
    ]);

    expect(parts).toHaveLength(1);
    expect(clientTools.decode(parts[0])).toMatchObject({ type: 'tool-call' });
  });

  it('carries the error state onto the result payload', () => {
    const parts = encoder.encode([
      {
        type: 'tool-invocation',
        toolCallId: 'c1',
        toolName: 't',
        input: {},
        state: 'output-error',
        output: 'boom',
      },
    ]);

    expect(clientTools.decode(parts[1])).toMatchObject({ isError: true });
  });

  it('drops parts that have no wire meaning', () => {
    expect(encoder.encode([{ type: 'step-start' }])).toEqual([]);
    expect(encoder.encode([{ type: 'text', text: '' }])).toEqual([]);
    expect(encoder.encode([{ type: 'file' }])).toEqual([]);
    expect(
      encoder.encode([
        { type: 'tool-invocation', toolName: 't', state: 'output-available' },
      ]),
    ).toEqual([]);
  });
});
