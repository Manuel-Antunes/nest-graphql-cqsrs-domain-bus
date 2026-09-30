export type MediaKind = 'audio' | 'image' | 'document';

export class MediaKinds {
  private static readonly LABELS: Record<MediaKind, string> = {
    audio: 'transcrição de áudio',
    image: 'análise de imagem',
    document: 'análise de documento',
  };

  static of(mimeType: string | undefined): MediaKind {
    if (mimeType?.startsWith('image/')) return 'image';
    if (mimeType?.startsWith('audio/')) return 'audio';
    return 'document';
  }

  static labelOf(kind: MediaKind): string {
    return MediaKinds.LABELS[kind];
  }
}
