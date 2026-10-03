import type { Message, Part } from '@a2a-js/sdk';
import type { AgentExecutionEvent, RequestContext } from '@a2a-js/sdk/server';

import { BaseExtension } from '../extension';

export interface A2uiClientCapabilities {
  supportedCatalogIds: string[];
  inlineCatalogs?: unknown[];
}

export interface A2uiParams extends Record<string, unknown> {
  acceptsInlineCatalogs?: true;
  supportedCatalogIds?: string[];
}

export interface A2uiExtensionOptions {
  acceptsInlineCustomCatalog?: boolean;
  supportedCatalogIds?: string[];
}

export class A2uiExtension extends BaseExtension<
  never,
  readonly [],
  A2uiParams
> {
  static readonly MIME_TYPE_KEY = 'mimeType';
  static readonly MIME_TYPE = 'application/json+a2ui';
  static readonly CLIENT_CAPABILITIES_KEY = 'a2uiClientCapabilities';
  static readonly BASIC_CATALOG_ID =
    'https://a2ui.org/specification/v0_9/basic_catalog.json';
  static readonly MCP_APP_COMPONENT = 'McpApp';

  readonly name = 'a2ui';
  readonly version = 'v0.9';
  readonly description = 'Provides agent driven UI using the A2UI JSON format.';
  override readonly params: A2uiParams;
  protected override readonly baseUri = 'https://a2ui.org/a2a-extension';

  constructor(options: A2uiExtensionOptions = {}) {
    super();
    this.params = {
      ...(options.acceptsInlineCustomCatalog
        ? { acceptsInlineCatalogs: true as const }
        : {}),
      ...(options.supportedCatalogIds?.length
        ? { supportedCatalogIds: options.supportedCatalogIds }
        : {}),
    };
  }

  override decorateEvent(event: AgentExecutionEvent): void {
    const message = this.messageOf(event);
    if (message?.parts.some((part) => this.isPart(part))) this.claim(message);
  }

  part(data: unknown): Part {
    return {
      content: { $case: 'data', value: data },
      metadata: { [A2uiExtension.MIME_TYPE_KEY]: A2uiExtension.MIME_TYPE },
      filename: '',
      mediaType: 'application/json',
    };
  }

  isPart(part: Part): boolean {
    return (
      part.content?.$case === 'data' &&
      part.metadata?.[A2uiExtension.MIME_TYPE_KEY] === A2uiExtension.MIME_TYPE
    );
  }

  dataOf(part: Part): unknown | undefined {
    return this.isPart(part) && part.content?.$case === 'data'
      ? part.content.value
      : undefined;
  }

  messagesIn(parts: readonly Part[]): unknown[] {
    return parts.flatMap((part) => {
      const data = this.dataOf(part);
      return data === undefined ? [] : [data];
    });
  }

  clientCapabilities(
    supportedCatalogIds: string[] = [A2uiExtension.BASIC_CATALOG_ID],
  ): A2uiClientCapabilities {
    return { supportedCatalogIds };
  }

  withClientCapabilities<T extends Message>(
    message: T,
    capabilities: A2uiClientCapabilities = this.clientCapabilities(),
  ): T {
    return {
      ...message,
      metadata: {
        ...(message.metadata ?? {}),
        [A2uiExtension.CLIENT_CAPABILITIES_KEY]: capabilities,
      },
    };
  }

  clientCapabilitiesOf(message: Message): A2uiClientCapabilities | undefined {
    const value = message.metadata?.[A2uiExtension.CLIENT_CAPABILITIES_KEY];
    return value && typeof value === 'object' && 'supportedCatalogIds' in value
      ? (value as A2uiClientCapabilities)
      : undefined;
  }

  catalogIdsFor(request: Pick<RequestContext, 'userMessage'>): string[] {
    const ids = this.clientCapabilitiesOf(
      request.userMessage,
    )?.supportedCatalogIds;
    return Array.isArray(ids)
      ? ids.filter((id): id is string => typeof id === 'string' && id !== '')
      : [];
  }
}
