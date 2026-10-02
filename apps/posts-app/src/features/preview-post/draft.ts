export interface Draft {
  readonly title: string;
  readonly content: string;
  readonly postId?: string;
}

export class Drafts {
  static from(input: unknown): Draft {
    const value = (input ?? {}) as Record<string, unknown>;
    const postId = Drafts.text(value.postId).trim();
    return {
      title: Drafts.text(value.title),
      content: Drafts.text(value.content),
      ...(postId ? { postId } : {}),
    };
  }

  static isDraft(value: unknown): value is Draft {
    return (
      !!value &&
      typeof value === 'object' &&
      typeof (value as Draft).title === 'string' &&
      typeof (value as Draft).content === 'string'
    );
  }

  private static text(value: unknown): string {
    return typeof value === 'string' ? value : '';
  }
}
