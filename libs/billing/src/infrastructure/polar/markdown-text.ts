const LIST_ITEM = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/;

export class MarkdownText {
  static inline(markdown: string): string {
    return markdown
      .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/(\*\*|__)(.+?)\1/g, '$2')
      .replace(/\*(\S(?:.*?\S)?)\*/g, '$1')
      .replace(/`([^`]*)`/g, '$1')
      .replace(/^\s*#{1,6}\s+/, '')
      .replace(/^\s*>\s?/, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  static split(markdown: string): { prose: string; items: string[] } {
    const prose: string[] = [];
    const items: string[] = [];
    for (const line of markdown.split(/\r?\n/)) {
      const item = LIST_ITEM.exec(line);
      const text = MarkdownText.inline(item ? item[1] : line);
      if (text) {
        (item ? items : prose).push(text);
      }
    }
    return { prose: prose.join(' '), items };
  }
}
