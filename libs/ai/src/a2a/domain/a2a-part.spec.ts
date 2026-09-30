import { A2aWire } from '../testing/a2a-wire';
import { A2aPart } from './a2a-part';

describe('A2aPart', () => {
  it('discriminates by member, never by a kind field', () => {
    const parts = [
      A2aPart.text('olá'),
      A2aPart.url('https://cdn.example/a.pdf', 'application/pdf', 'a.pdf'),
      A2aPart.data({ any: 'thing' }),
    ];

    expect(parts.map((part) => part.content)).toEqual([
      { $case: 'text', value: 'olá' },
      { $case: 'url', value: 'https://cdn.example/a.pdf' },
      { $case: 'data', value: { any: 'thing' } },
    ]);
    expect(A2aWire.keyPathsOf(parts, 'kind')).toEqual([]);
  });

  it('puts a file’s media type and name on the part, not in a nested file object', () => {
    const part = A2aPart.url(
      'https://cdn.example/a.pdf',
      'application/pdf',
      'a.pdf',
    );

    expect(part.mediaType).toBe('application/pdf');
    expect(part.filename).toBe('a.pdf');
    expect(part).not.toHaveProperty('file');
  });

  it('spells out filename and metadata, which v1.0 requires to be present', () => {
    expect(Object.keys(A2aPart.text('x')).sort()).toEqual(
      ['content', 'filename', 'mediaType', 'metadata'].sort(),
    );
  });

  it('reads the prose of a message and skips everything else', () => {
    expect(
      A2aPart.textOf([
        A2aPart.text('segue '),
        A2aPart.data({ type: 'tool-call' }),
        A2aPart.text('o anexo'),
      ]),
    ).toBe('segue o anexo');
  });

  it('tells a file part from prose and data', () => {
    expect(A2aPart.isFile(A2aPart.url('https://x.test/a', 'image/png'))).toBe(
      true,
    );
    expect(
      A2aPart.isFile({
        content: { $case: 'raw', value: Buffer.from('x') },
        metadata: undefined,
        filename: '',
        mediaType: 'image/png',
      }),
    ).toBe(true);
    expect(A2aPart.isFile(A2aPart.text('x'))).toBe(false);
    expect(A2aPart.isFile(A2aPart.data({}))).toBe(false);
  });

  it('reads inline bytes as base64, from raw bytes and from a data URI', () => {
    expect(
      A2aPart.inlineBase64Of({
        content: { $case: 'raw', value: Buffer.from('oi') },
        metadata: undefined,
        filename: '',
        mediaType: 'text/plain',
      }),
    ).toBe(Buffer.from('oi').toString('base64'));
    expect(
      A2aPart.inlineBase64Of(
        A2aPart.url('data:text/plain;base64,b2k=', 'text/plain'),
      ),
    ).toBe('b2k=');
    expect(
      A2aPart.inlineBase64Of(A2aPart.url('https://x.test/a.png', 'image/png')),
    ).toBeUndefined();
  });

  it('treats only an http(s) URL as a remote reference to download', () => {
    expect(
      A2aPart.remoteUrlOf(A2aPart.url('https://x.test/a.png', 'image/png')),
    ).toBe('https://x.test/a.png');
    expect(
      A2aPart.remoteUrlOf(
        A2aPart.url('data:image/png;base64,AA==', 'image/png'),
      ),
    ).toBeUndefined();
    expect(
      A2aPart.remoteUrlOf(A2aPart.url('file:///etc/passwd', 'text/plain')),
    ).toBeUndefined();
  });
});
