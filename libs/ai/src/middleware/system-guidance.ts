import { SystemMessage } from '@langchain/core/messages';

export class SystemGuidance {
  static append(
    request: { systemMessage?: SystemMessage },
    ...sections: Array<string | null | undefined | false>
  ): SystemMessage {
    const base = request.systemMessage ?? new SystemMessage('');
    const addition = sections
      .filter(
        (section): section is string =>
          typeof section === 'string' && section.trim().length > 0,
      )
      .join('\n\n');
    if (!addition) return base;
    const separator = base.text ? '\n\n' : '';
    return base.concat(`${separator}${addition}`);
  }
}
