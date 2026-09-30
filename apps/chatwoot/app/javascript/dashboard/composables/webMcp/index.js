/**
 * WebMCP toolkit for the chatwoot dashboard — a Vue port of the web app's
 * `@acme/ui/components/web-mcp`. Exposes browser "tools" to an in-page AI
 * agent via `navigator.modelContext` (with a polyfill where the native API,
 * Chrome 146+, isn't present).
 *
 * Typical usage inside a component's <script setup>:
 *
 *   import { useMcpTool } from 'dashboard/composables/webMcp';
 *
 *   useMcpTool({
 *     name: 'do_something',
 *     description: 'What the agent can do here',
 *     readOnly: true,
 *     inputSchema: { type: 'object', properties: {} },
 *     handler: async args => ({ content: [{ type: 'text', text: 'done' }] }),
 *   });
 */
export {
  useMcpTool,
  abortToolByName,
  purgeAllImperativeTools,
} from './useMcpTool';
export {
  createRegistry,
  ensureWebMcp,
  getActiveRegistry,
  setActiveRegistry,
  installPolyfill,
  cleanupPolyfill,
  hasNativeModelContext,
  startIframeBridge,
} from './host';
export { registerWebMcpTools } from './tools';
