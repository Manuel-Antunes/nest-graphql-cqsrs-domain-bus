export interface AttachmentFile {
  readonly name: string;
  readonly mimeType: string;
  readonly buffer: Buffer;
}

export interface PostDraft {
  readonly title: string;
  readonly content: string;
  readonly attachment?: AttachmentFile;
}

export class PostEvent {
  static readonly PRE_CREATED = 'posts.PostPreCreated';
  static readonly CREATED = 'posts.PostCreated';
  static readonly UPDATED = 'posts.PostUpdated';
}

export class Png {
  static named(name: string, buffer: Buffer): AttachmentFile {
    return { name, mimeType: 'image/png', buffer };
  }
}
