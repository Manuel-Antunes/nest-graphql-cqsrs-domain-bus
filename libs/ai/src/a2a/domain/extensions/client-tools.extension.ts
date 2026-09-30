import type { Message } from '@a2a-js/sdk';
import type { AgentExecutionEvent, RequestContext } from '@a2a-js/sdk/server';

import { BaseExtension } from '../extension';
import type { HitlReviewPolicy } from './human-in-the-loop.extension';

export interface ClientToolDeclaration {
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
  review?: HitlReviewPolicy;
}

export interface ClientToolsPayload {
  type: 'client-tools';
  tools: ClientToolDeclaration[];
}

export interface ToolCallPayload {
  type: 'tool-call';
  toolCallId: string;
  toolName: string;
  args: unknown;
  execution: 'client' | 'server';
}

export interface ToolResultPayload {
  type: 'tool-result';
  toolCallId: string;
  toolName: string;
  result: unknown;
  isError?: boolean;
}

export type ClientToolsExtensionPayload =
  | ClientToolsPayload
  | ToolCallPayload
  | ToolResultPayload;

export class ClientToolsExtension extends BaseExtension<ClientToolsExtensionPayload> {
  static readonly ENVELOPE_TOOL = 'intercept_client_call';
  private static readonly REJECTED_SCHEMA_KEYS = new Set([
    '$schema',
    'additionalProperties',
  ]);

  readonly name = 'client-tools';
  readonly version = 'v1';
  readonly description =
    'Browser-executed tools: client declares callable tools, agent requests calls, client returns results.';
  protected override readonly payloadTypes = [
    'client-tools',
    'tool-call',
    'tool-result',
  ] as const;

  override decorateEvent(event: AgentExecutionEvent): void {
    const message = this.messageOf(event);
    if (message && this.carriesToolPayload(message)) this.claim(message);
  }

  carriesToolPayload(message: Message): boolean {
    return this.carries(message, () => true);
  }

  toolsDeclaredFor(
    request: Pick<RequestContext, 'userMessage' | 'task' | 'context'>,
  ): ClientToolDeclaration[] {
    if (!this.isActivatedFor(request)) return [];
    const payload = this.decodeFromTurn(request, 'client-tools');
    return (payload?.tools ?? []).map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters
        ? (ClientToolsExtension.sanitize(tool.parameters) as Record<
            string,
            unknown
          >)
        : undefined,
      review: tool.review,
    }));
  }

  resultsIn(request: Pick<RequestContext, 'userMessage'>): ToolResultPayload[] {
    return this.decodeAll(request.userMessage.parts, 'tool-result');
  }

  promptFor(
    tools: readonly Pick<ClientToolDeclaration, 'name' | 'description'>[],
  ): string {
    if (tools.length === 0) {
      return [
        '## Ferramentas da página atual',
        '',
        'Nenhuma ferramenta específica de página está registrada no momento. Se o usuário pedir uma ação que normalmente exigiria uma ferramenta de página (criar/editar entidades, filtrar tabela, etc.), use `navigate_to_page` para ir até a página relevante — as ferramentas dela serão listadas aqui na próxima mensagem.',
      ].join('\n');
    }
    return [
      '## Ferramentas da página atual',
      '',
      'Além das suas ferramentas padrão, a página que o usuário está vendo registrou as ferramentas listadas abaixo. Use o nome EXATO como aparece:',
      '',
      ...tools.map(
        (tool) =>
          `- \`${tool.name}\`: ${tool.description ?? '(sem descrição)'}`,
      ),
      '',
      'Regras:',
      '- **Sempre prefira essas ferramentas** quando o pedido do usuário cair no escopo delas, em vez de explicar como o usuário faria manualmente.',
      '- **NUNCA invente nomes de ferramentas.** Se você não vê a ferramenta exata na lista acima, ela não existe nesta página — não chame `create_*`, `add_*` etc por intuição.',
      '- Se a ferramenta que você precisa não está listada, é provável que ela viva em outra página. Use `navigate_to_page` para ir até lá; na próxima mensagem a lista acima será atualizada automaticamente com as ferramentas da nova página.',
      '- Antes de dizer ao usuário que algo é impossível, releia esta lista — a ferramenta certa pode estar aqui com um nome diferente do que você esperava.',
    ].join('\n');
  }

  private static sanitize(schema: unknown): unknown {
    if (Array.isArray(schema)) return schema.map(ClientToolsExtension.sanitize);
    if (!schema || typeof schema !== 'object') return schema;
    return Object.fromEntries(
      Object.entries(schema)
        .filter(([key]) => !ClientToolsExtension.REJECTED_SCHEMA_KEYS.has(key))
        .map(([key, value]) => [key, ClientToolsExtension.sanitize(value)]),
    );
  }
}
