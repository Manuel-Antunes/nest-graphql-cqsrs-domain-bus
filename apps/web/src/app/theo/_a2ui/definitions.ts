import type { CatalogDefinitions } from '@copilotkit/a2ui-renderer';
import { z } from 'zod/v3';

type ComponentProps = CatalogDefinitions[string]['props'];

const McpAppProps = z.object({
  server: z
    .string()
    .describe('The MCP server the app comes from, as this host names it.'),
  resourceUri: z.string().describe('The ui:// resource of the app.'),
  toolName: z.string().describe('The tool whose result the app opens on.'),
  toolInput: z.record(z.string(), z.unknown()).optional(),
  toolResult: z.record(z.string(), z.unknown()).optional(),
  title: z.string().optional(),
});

export type McpAppProps = z.infer<typeof McpAppProps>;

export const theoCatalogDefinitions: CatalogDefinitions = {
  McpApp: {
    description:
      'An MCP App: an interactive application an MCP server publishes as a ui:// resource, opened on the result of one of its tools, where the person acts with its own buttons. Only the agent that called the tool places one; never generate it yourself.',
    props: McpAppProps as unknown as ComponentProps,
  },
};
