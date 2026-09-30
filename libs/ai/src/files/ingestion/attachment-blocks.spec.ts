import { HumanMessage } from '@langchain/core/messages';

import { type AttachmentBlock, AttachmentBlocks } from './attachment-blocks';

const block = (
  path: string,
  extra: Partial<AttachmentBlock> = {},
): AttachmentBlock => ({
  path,
  fileName: 'f.png',
  kind: 'image',
  mimeType: 'image/png',
  marker: `[Anexo: f.png — análise de imagem — path=${path}]`,
  ...extra,
});

const message = (content: unknown, blocks: AttachmentBlock[]) =>
  new HumanMessage({
    id: 'm1',
    content: content as never,
    additional_kwargs: AttachmentBlocks.with(undefined, blocks),
  });

describe('AttachmentBlocks.with', () => {
  it('keeps whatever else was on the message', () => {
    const b = block('/attachments/a.png');
    expect(AttachmentBlocks.with({ keep: 1 }, [b])).toEqual({
      keep: 1,
      [AttachmentBlocks.KEY]: [b],
    });
  });

  it('adds nothing when there is nothing to add', () => {
    expect(AttachmentBlocks.with({ keep: 1 }, [])).toEqual({ keep: 1 });
    expect(AttachmentBlocks.with(undefined, [])).toBeUndefined();
  });
});

describe('AttachmentBlocks.of', () => {
  it('ignores a message that carries none', () => {
    expect(AttachmentBlocks.of(new HumanMessage('oi'))).toBeUndefined();
  });

  it('ignores junk under the key rather than trusting it', () => {
    const m = new HumanMessage({
      content: 'oi',
      additional_kwargs: { [AttachmentBlocks.KEY]: 'not-an-array' },
    });
    expect(AttachmentBlocks.of(m)).toBeUndefined();
  });

  it('still sees a block that afterModel already pruned', () => {
    const m = message('oi', [
      AttachmentBlocks.stored(block('/attachments/a.png')),
    ]);
    expect(AttachmentBlocks.of(m)?.[0]?.path).toBe('/attachments/a.png');
  });
});

describe('AttachmentBlocks.stored / strip', () => {
  it('keeps the file, drops what the middleware wrote about it', () => {
    const stored = AttachmentBlocks.stored(
      block('/attachments/a.png', {
        url: 'https://cdn/a.png',
        caption: 'olha isso',
        text: 'uma foto de um documento',
      }),
    );
    expect(stored).toEqual({
      path: '/attachments/a.png',
      fileName: 'f.png',
      kind: 'image',
      mimeType: 'image/png',
      url: 'https://cdn/a.png',
    });
  });

  it('keeps the quoted flag — the marker has to be rebuilt with it', () => {
    const stored = AttachmentBlocks.stored(
      block('/attachments/a.png', { quoted: true }),
    );
    expect(stored.quoted).toBe(true);
  });

  it('returns the SAME kwargs reference when every block is already pruned', () => {
    const kwargs = AttachmentBlocks.with(undefined, [
      AttachmentBlocks.stored(block('/attachments/a.png')),
    ]);
    expect(AttachmentBlocks.strip(kwargs)).toBe(kwargs);
  });

  it('returns the SAME reference when there are no blocks at all', () => {
    const kwargs = { inbound: { threadId: '1' } };
    expect(AttachmentBlocks.strip(kwargs)).toBe(kwargs);
  });

  it('leaves the rest of additional_kwargs untouched', () => {
    const kwargs = AttachmentBlocks.with({ inbound: { threadId: '1' } }, [
      block('/attachments/a.png', { text: 'análise' }),
    ]);
    const pruned = AttachmentBlocks.strip(kwargs);
    expect(pruned?.inbound).toEqual({ threadId: '1' });
    expect(
      (pruned?.[AttachmentBlocks.KEY] as AttachmentBlock[] | undefined)?.[0]
        ?.text,
    ).toBeUndefined();
  });
});

describe('AttachmentBlocks.needsRehydration', () => {
  it('is true exactly for a pruned block', () => {
    expect(AttachmentBlocks.needsRehydration(block('/attachments/a.png'))).toBe(
      false,
    );
    expect(
      AttachmentBlocks.needsRehydration(
        AttachmentBlocks.stored(block('/attachments/a.png')),
      ),
    ).toBe(true);
  });
});

describe('AttachmentBlocks.render', () => {
  it('is marker → caption → analysis, skipping what is absent', () => {
    expect(
      AttachmentBlocks.render(
        block('/attachments/a.png', { caption: 'meu doc', text: 'é um RG' }),
      ),
    ).toBe(
      '[Anexo: f.png — análise de imagem — path=/attachments/a.png]\nLegenda do usuário: meu doc\né um RG',
    );

    expect(AttachmentBlocks.render(block('/attachments/a.png'))).toBe(
      '[Anexo: f.png — análise de imagem — path=/attachments/a.png]',
    );
  });
});

describe('AttachmentBlocks.inflate', () => {
  it('returns the SAME reference when there is nothing to inflate', () => {
    const m = new HumanMessage('sem anexo');
    expect(AttachmentBlocks.inflate(m)).toBe(m);
  });

  it('returns the SAME reference when every block was pruned and no sidecar restored it', () => {
    const m = message('oi', [
      AttachmentBlocks.stored(block('/attachments/a.png')),
    ]);
    expect(AttachmentBlocks.inflate(m)).toBe(m);
  });

  it('appends one block per attachment, after the user content', () => {
    const m = message(
      [{ type: 'text', text: 'olha os dois' }],
      [
        block('/attachments/a.png', { fileName: 'a.png', text: 'sou o A' }),
        block('/attachments/b.png', { fileName: 'b.png', text: 'sou o B' }),
      ],
    );

    const texts = (
      AttachmentBlocks.inflate(m).content as Array<{ text: string }>
    ).map((p) => p.text);

    expect(texts).toHaveLength(3);
    expect(texts[0]).toBe('olha os dois');
    expect(texts[1]).toContain('sou o A');
    expect(texts[1]).toContain('path=/attachments/a.png');
    expect(texts[2]).toContain('sou o B');
    expect(texts[2]).toContain('path=/attachments/b.png');
  });

  it('handles a plain-string message without losing the text', () => {
    const m = message('só texto', [block('/attachments/a.png', { text: 'A' })]);
    const parts = AttachmentBlocks.inflate(m).content as Array<{
      text: string;
    }>;
    expect(parts[0].text).toBe('só texto');
    expect(parts[1].text).toContain('A');
  });

  it('produces a message even when the user sent ONLY a file', () => {
    const m = message([], [block('/attachments/a.png', { text: 'A' })]);
    const parts = AttachmentBlocks.inflate(m).content as Array<{
      text: string;
    }>;
    expect(parts).toHaveLength(1);
    expect(parts[0].text).toContain('path=/attachments/a.png');
  });

  it('leaves the stashed blocks in place, so state is never the inflated copy', () => {
    const m = message(
      [{ type: 'text', text: 'oi' }],
      [block('/attachments/a.png', { text: 'A' })],
    );

    const once = AttachmentBlocks.inflate(m);

    const twice = AttachmentBlocks.inflate(once);
    expect((twice.content as unknown[]).length).toBe(
      (once.content as unknown[]).length + 1,
    );
    expect(AttachmentBlocks.of(once)).toEqual(AttachmentBlocks.of(m));
  });
});
