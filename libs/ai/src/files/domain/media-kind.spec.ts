import { MediaKinds } from './media-kind';

describe('MediaKinds', () => {
  it.each([
    ['image/png', 'image'],
    ['audio/ogg; codecs=opus', 'audio'],
    ['application/pdf', 'document'],
    [undefined, 'document'],
  ] as const)('classifies %s as %s', (mimeType, kind) => {
    expect(MediaKinds.of(mimeType)).toBe(kind);
  });

  it('labels each kind the way the attachment marker names it', () => {
    expect(MediaKinds.labelOf('audio')).toBe('transcrição de áudio');
    expect(MediaKinds.labelOf('image')).toBe('análise de imagem');
    expect(MediaKinds.labelOf('document')).toBe('análise de documento');
  });
});
