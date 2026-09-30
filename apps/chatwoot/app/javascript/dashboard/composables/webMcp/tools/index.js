/**
 * Registers every chatwoot WebMCP tool. Call once at boot (see
 * entrypoints/dashboard.js). `apolloClient` is injected for the GraphQL-backed
 * tools; the Vuex-backed ones reach the store singleton directly.
 */
import { registerAssignClientTool } from './assignClient';
import { registerUnassignClientTool } from './unassignClient';
import { registerSearchClientsTool } from './searchClients';
import { registerChangeStatusTool } from './changeStatus';
import { registerSendMessageTool } from './sendMessage';

export function registerWebMcpTools({ apolloClient }) {
  registerSearchClientsTool({ apolloClient });
  registerAssignClientTool({ apolloClient });
  registerUnassignClientTool({ apolloClient });
  registerChangeStatusTool();
  registerSendMessageTool();
}
