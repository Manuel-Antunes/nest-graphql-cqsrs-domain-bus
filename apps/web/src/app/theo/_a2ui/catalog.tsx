import {
  type CatalogRenderers,
  createCatalog,
} from '@copilotkit/a2ui-renderer';

import { type McpAppProps, theoCatalogDefinitions } from './definitions';
import { McpAppFrame } from './mcp-app-frame';

export const THEO_A2UI_CATALOG_ID = 'nestposts://a2ui/catalogs/theo/v1';

const renderers: CatalogRenderers<typeof theoCatalogDefinitions> = {
  McpApp: ({ props }) => <McpAppFrame {...(props as McpAppProps)} />,
};

export const theoCatalog = createCatalog(theoCatalogDefinitions, renderers, {
  catalogId: THEO_A2UI_CATALOG_ID,
  includeBasicCatalog: true,
});
