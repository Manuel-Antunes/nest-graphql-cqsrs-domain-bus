import type { RequestContext } from '@a2a-js/sdk/server';

import { BaseExtension } from '../extension';

export interface BrowserTabRef {
  tabId: number;
  url: string;
  title?: string;
}

export interface BrowserPageContext extends BrowserTabRef {
  content?: string;
  truncated?: boolean;
}

export interface BrowserContextPayload {
  type: 'browser-context';
  current?: BrowserPageContext;
  others: BrowserTabRef[];
}

export class BrowserContextExtension extends BaseExtension<BrowserContextPayload> {
  readonly name = 'browser-context';
  readonly version = 'v1';
  readonly description =
    "The caller's browsing context: the page it is on (title, URL, readable text) and the links of its other open tabs.";
  protected override readonly payloadTypes = ['browser-context'] as const;

  contextFor(
    request: Pick<RequestContext, 'userMessage' | 'task' | 'context'>,
  ): BrowserContextPayload | undefined {
    if (!this.isActivatedFor(request)) return undefined;
    return this.decodeFromTurn(request, 'browser-context');
  }

  render(context: BrowserContextPayload | undefined): string {
    if (!context) return '';
    const { current, others = [] } = context;
    if (!current && others.length === 0) return '';

    const lines = ['## Contexto do navegador', ''];

    if (current) {
      lines.push(
        `O usuário está vendo **${current.title || current.url}** (${current.url}).`,
      );
      if (current.content) {
        lines.push(
          '',
          `Conteúdo da página${
            current.truncated
              ? ' (CORTADO — o texto abaixo não é a página inteira; não afirme que algo não existe nela só porque não aparece aqui):'
              : ':'
          }`,
          '',
          current.content,
        );
      }
    } else {
      lines.push(
        'Não foi possível ler a página atual (pode ser uma página restrita do navegador).',
      );
    }

    if (others.length > 0) {
      lines.push(
        '',
        'Outras abas abertas — você tem APENAS o título e o link delas, NÃO o conteúdo:',
        '',
        ...others.map((tab) => `- ${tab.title || tab.url} — ${tab.url}`),
        '',
        'Para trabalhar com uma dessas abas, peça ao usuário que a abra (ou use `navigate_to_page`, se a ferramenta estiver disponível). NUNCA descreva o conteúdo de uma aba a partir do título ou da URL.',
      );
    }

    return lines.join('\n');
  }
}
