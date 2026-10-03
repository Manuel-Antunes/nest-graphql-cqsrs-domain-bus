import type { Context } from '@ag-ui/core';

import {
  type A2uiClientCapabilities,
  A2uiExtension,
} from '../domain/extensions/a2ui.extension';

type CatalogSchema = { catalogId: string; components: Record<string, unknown> };

export class A2uiCapabilities {
  static readonly OPERATIONS_KEY = 'a2ui_operations';

  static of(
    entries: readonly Context[] | undefined,
  ): A2uiClientCapabilities | undefined {
    const catalogIds = (entries ?? [])
      .flatMap((entry) => A2uiCapabilities.catalogOf(entry.value))
      .filter(
        (catalog) => A2uiExtension.MCP_APP_COMPONENT in catalog.components,
      )
      .map((catalog) => catalog.catalogId);
    return catalogIds.length
      ? { supportedCatalogIds: [...new Set(catalogIds)] }
      : undefined;
  }

  static report(answer: string, operations: readonly unknown[]): string {
    return operations.length
      ? JSON.stringify({
          [A2uiCapabilities.OPERATIONS_KEY]: operations,
          answer,
        })
      : answer;
  }

  private static catalogOf(value: unknown): CatalogSchema[] {
    if (typeof value !== 'string') return [];
    try {
      const parsed = JSON.parse(value) as Partial<CatalogSchema> | null;
      return typeof parsed?.catalogId === 'string' &&
        parsed.components &&
        typeof parsed.components === 'object'
        ? [parsed as CatalogSchema]
        : [];
    } catch {
      return [];
    }
  }
}
