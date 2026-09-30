import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';

import { BinaryBlockEviction } from './binary-block-eviction';

function imageResult(toolCallId: string, chars: number, fill = 'A') {
  return new ToolMessage({
    name: 'read_file',
    tool_call_id: toolCallId,
    content: [
      { type: 'image', mimeType: 'image/jpeg', data: fill.repeat(chars) },
    ] as never,
  });
}

function readFileCall(toolCallId: string, filePath: string) {
  return new AIMessage({
    content: '',
    tool_calls: [
      { id: toolCallId, name: 'read_file', args: { file_path: filePath } },
    ],
  });
}

function textOf(message: { content: unknown }): string {
  return (message.content as Array<{ type: string; text?: string }>)
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

function binaryBlocks(messages: readonly { content: unknown }[]) {
  return messages
    .flatMap((m) => (Array.isArray(m.content) ? m.content : []))
    .filter((block) => (block as { type?: string }).type === 'image');
}

describe('BinaryBlockEviction.evict', () => {
  it('keeps ONE copy when the same file was read repeatedly', () => {
    const messages = [
      new HumanMessage('me mostra o comprovante'),
      readFileCall('t1', '/attachments/391.jpg'),
      imageResult('t1', 1_000),
      readFileCall('t2', '/attachments/391.jpg'),
      imageResult('t2', 1_000),
      readFileCall('t3', '/attachments/391.jpg'),
      imageResult('t3', 1_000),
    ];

    const result = BinaryBlockEviction.evict(messages);

    expect(binaryBlocks(result)).toHaveLength(1);
  });

  it('keeps the NEWEST copy, not the oldest', () => {
    const messages = [
      readFileCall('old', '/attachments/1.jpg'),
      imageResult('old', 10, 'A'),
      readFileCall('new', '/attachments/2.jpg'),
      imageResult('new', 10, 'B'),
    ];

    const result = BinaryBlockEviction.evict(messages, 10);

    expect(binaryBlocks(result)).toEqual([
      { type: 'image', mimeType: 'image/jpeg', data: 'B'.repeat(10) },
    ]);
  });

  it('leaves an actionable placeholder naming the file the model can re-read', () => {
    const messages = [
      readFileCall('t1', '/attachments/391.jpg'),
      imageResult('t1', 1_000, 'A'),
      readFileCall('t2', '/attachments/outro.jpg'),
      imageResult('t2', 1_000, 'B'),
    ];

    const result = BinaryBlockEviction.evict(messages, 1_000);

    expect(textOf(result[1])).toContain('/attachments/391.jpg');
    expect(textOf(result[1])).toContain('read_file');
  });

  it('preserves message count and order — the summarization cutoff is positional', () => {
    const messages = [
      new HumanMessage('oi'),
      readFileCall('t1', '/a.jpg'),
      imageResult('t1', 5_000),
      readFileCall('t2', '/a.jpg'),
      imageResult('t2', 5_000),
    ];

    const result = BinaryBlockEviction.evict(messages, 5_000);

    expect(result).toHaveLength(messages.length);
    expect(result[0]).toBe(messages[0]);
    expect(result[1]).toBe(messages[1]);
  });

  it('keeps ToolMessage identity so downstream `isInstance` checks still hold', () => {
    const messages = [
      readFileCall('t1', '/a.jpg'),
      imageResult('t1', 100, 'A'),
      readFileCall('t2', '/a.jpg'),
      imageResult('t2', 100, 'A'),
    ];

    const result = BinaryBlockEviction.evict(messages, 100);

    expect(ToolMessage.isInstance(result[1])).toBe(true);
    expect((result[1] as ToolMessage).tool_call_id).toBe('t1');
  });

  it('returns the same reference when there is nothing to evict', () => {
    const messages = [new HumanMessage('sem anexo'), new AIMessage('ok')];

    expect(BinaryBlockEviction.evict(messages)).toBe(messages);
  });

  it('lets a single attachment through under the default budget', () => {
    const messages = [
      readFileCall('t1', '/attachments/391.jpg'),
      imageResult('t1', 222_000),
    ];

    expect(BinaryBlockEviction.MAX_INLINE_CHARS).toBeGreaterThan(222_000);
    expect(binaryBlocks(BinaryBlockEviction.evict(messages))).toHaveLength(1);
  });

  it('evicts audio, video and generic file blocks too, not just images', () => {
    const kinds = ['audio', 'video', 'file'];
    for (const type of kinds) {
      const dup = () =>
        new ToolMessage({
          name: 'read_file',
          tool_call_id: 't',
          content: [{ type, mimeType: `${type}/x`, data: 'Z'.repeat(50) }],
        } as never);
      const result = BinaryBlockEviction.evict([dup(), dup()], 50);
      const survivors = result
        .flatMap((m) => (Array.isArray(m.content) ? m.content : []))
        .filter((b) => (b as { type?: string }).type === type);
      expect(survivors, `${type} should be deduplicated`).toHaveLength(1);
    }
  });
});

describe('BinaryBlockEviction.evict, as the checkpoint prune calls it', () => {
  it('evicts every inline binary when the budget is zero, and keeps the serializer snapshot clean', () => {
    const data = 'B'.repeat(64);
    const messages = [
      readFileCall('c1', '/attachments/1.pdf'),
      imageResult('c1', 64, 'B'),
    ];

    const [, evicted] = BinaryBlockEviction.evict(messages, 0);

    expect(ToolMessage.isInstance(evicted)).toBe(true);
    expect(JSON.stringify(evicted)).not.toContain(data);
    expect((evicted as ToolMessage).content).toEqual([
      expect.objectContaining({
        type: 'text',
        text: expect.stringContaining('read_file("/attachments/1.pdf")'),
      }),
    ]);
  });
});
