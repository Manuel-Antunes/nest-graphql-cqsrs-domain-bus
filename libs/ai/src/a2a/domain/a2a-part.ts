import type { Part } from '@a2a-js/sdk';

export class A2aPart {
  static text(text: string): Part {
    return {
      content: { $case: 'text', value: text },
      metadata: undefined,
      filename: '',
      mediaType: 'text/plain',
    };
  }

  static data(value: unknown, mediaType = 'application/json'): Part {
    return {
      content: { $case: 'data', value },
      metadata: undefined,
      filename: '',
      mediaType,
    };
  }

  static url(url: string, mediaType: string, filename = ''): Part {
    return {
      content: { $case: 'url', value: url },
      metadata: undefined,
      filename,
      mediaType,
    };
  }

  static textOf(parts: readonly Part[]): string {
    return parts
      .map((part) => (part.content?.$case === 'text' ? part.content.value : ''))
      .filter(Boolean)
      .join('');
  }

  static isFile(part: Part): boolean {
    return part.content?.$case === 'raw' || part.content?.$case === 'url';
  }

  static inlineBase64Of(part: Part): string | undefined {
    if (part.content?.$case === 'raw') {
      const raw = part.content.value;
      return Buffer.isBuffer(raw)
        ? raw.toString('base64')
        : Buffer.from(raw as unknown as ArrayBuffer).toString('base64');
    }
    if (
      part.content?.$case === 'url' &&
      part.content.value.startsWith('data:')
    ) {
      const comma = part.content.value.indexOf(',');
      return comma >= 0 ? part.content.value.slice(comma + 1) : undefined;
    }
    return undefined;
  }

  static remoteUrlOf(part: Part): string | undefined {
    return part.content?.$case === 'url' &&
      /^https?:\/\//i.test(part.content.value)
      ? part.content.value
      : undefined;
  }
}
