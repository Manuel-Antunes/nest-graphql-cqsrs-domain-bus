/**
 * Framework-agnostic WebMCP plumbing — ported from
 * `libs/ui/src/components/web-mcp/host.ts` (TypeScript stripped, behaviour
 * preserved). No Vue imports here so it stays unit-testable in isolation and
 * mirrors the registry the web app uses.
 *
 *  - `createRegistry` builds a microtask-batched tool registry that owns the
 *    canonical Map<name, descriptor> and notifies subscribers once per
 *    microtask regardless of how many register/unregister calls happened.
 *  - `installPolyfill` mounts a registry on `navigator.modelContext` so code
 *    calling the native API surface (and Chrome's tool inspector, when no
 *    native API is present) talks to the registry.
 *  - `getActiveRegistry` / `setActiveRegistry` let the composable find the
 *    singleton registry without prop-drilling.
 *  - `ensureWebMcp` lazily activates a registry + installs the polyfill
 *    (when there's no native API). Idempotent — every composable calls it.
 *
 * Spec / docs:
 *   https://webmachinelearning.github.io/webmcp/
 *   https://developer.chrome.com/docs/ai/webmcp
 *   chrome://flags/#enable-webmcp-testing (Chrome 146+)
 */

const POLYFILL_MARKER = '__isWebMCPPolyfill';

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/**
 * Build a fresh registry. Registration semantics:
 * - Names must be non-empty strings. Duplicate registration **replaces** the
 *   previous entry instead of throwing — a new mount can register before the
 *   previous mount's cleanup has run during a route change.
 * - When an `AbortSignal` is supplied and fires, the registry removes the tool
 *   only if it still owns the entry that signal was attached to.
 * - Subscribers (`onToolsChanged`) are notified via `queueMicrotask`, so a
 *   burst of register/unregister calls coalesces into a single notification.
 */
export function createRegistry() {
  const tools = new Map();
  let changeCallback = null;
  let notificationPending = false;

  function scheduleNotification() {
    if (notificationPending) return;
    notificationPending = true;
    queueMicrotask(() => {
      notificationPending = false;
      if (changeCallback) changeCallback();
    });
  }

  function validate(tool) {
    if (typeof tool.name !== 'string' || tool.name === '') {
      throw new DOMException(
        'Tool name must be a non-empty string',
        'InvalidStateError'
      );
    }
    if (typeof tool.description !== 'string' || tool.description === '') {
      throw new DOMException(
        'Tool description must be a non-empty string',
        'InvalidStateError'
      );
    }
    if (typeof tool.execute !== 'function') {
      throw new DOMException(
        'Tool execute must be a function',
        'InvalidStateError'
      );
    }
  }

  return {
    registerTool(tool, options) {
      validate(tool);

      if (options && options.signal && options.signal.aborted) {
        // Already cancelled — nothing to do.
        return;
      }

      // Replace instead of throw on duplicate.
      if (tools.has(tool.name)) tools.delete(tool.name);

      const stored = {
        ...tool,
        inputSchema: tool.inputSchema || { type: 'object', properties: {} },
      };
      tools.set(tool.name, stored);
      scheduleNotification();

      if (options && options.signal) {
        const { name } = tool;
        options.signal.addEventListener(
          'abort',
          () => {
            // Only evict if we still own this slot.
            if (tools.get(name) === stored && tools.delete(name)) {
              scheduleNotification();
            }
          },
          { once: true }
        );
      }
    },

    unregisterTool(name) {
      if (tools.delete(name)) scheduleNotification();
    },

    getTools() {
      return tools;
    },

    onToolsChanged(cb) {
      changeCallback = cb;
    },
  };
}

// ---------------------------------------------------------------------------
// Polyfill: mount a registry as `navigator.modelContext`
// ---------------------------------------------------------------------------

/** True when Chrome's native `navigator.modelContext` is present (not our polyfill). */
export function hasNativeModelContext() {
  return (
    typeof navigator !== 'undefined' &&
    !!navigator.modelContext &&
    !(POLYFILL_MARKER in navigator.modelContext)
  );
}

/**
 * Install a polyfill on `navigator.modelContext` routing register/unregister
 * into the given registry. Returns `true` if installed, `false` if a native
 * API was already present (or we're outside a browser). Idempotent.
 */
export function installPolyfill(registry) {
  if (typeof navigator === 'undefined') return false;
  if (hasNativeModelContext()) return false;

  // Already polyfilled? Update its target registry in place (last-mounted wins).
  if (navigator.modelContext && POLYFILL_MARKER in navigator.modelContext) {
    navigator.modelContext.registerTool = (tool, options) =>
      registry.registerTool(tool, options);
    navigator.modelContext.unregisterTool = name =>
      registry.unregisterTool(name);
    return true;
  }

  navigator.modelContext = {
    [POLYFILL_MARKER]: true,
    registerTool: (tool, options) => registry.registerTool(tool, options),
    unregisterTool: name => registry.unregisterTool(name),
  };
  return true;
}

/** Remove the polyfill from `navigator.modelContext` (if we own it). */
export function cleanupPolyfill() {
  if (typeof navigator === 'undefined') return;
  if (navigator.modelContext && POLYFILL_MARKER in navigator.modelContext) {
    delete navigator.modelContext;
  }
}

// ---------------------------------------------------------------------------
// Active registry singleton + lazy bootstrap
// ---------------------------------------------------------------------------

let activeRegistry = null;

export function setActiveRegistry(registry) {
  activeRegistry = registry;
}

export function getActiveRegistry() {
  if (!activeRegistry) activeRegistry = createRegistry();
  return activeRegistry;
}

/**
 * Lazily activate a registry and, when there's no native API, install the
 * polyfill so `navigator.modelContext` exists. Idempotent — safe to call from
 * every `useMcpTool` invocation. Chatwoot is a single client SPA, so there is
 * no provider/consumer-counting to manage: the polyfill lives for the page and
 * the `pagehide` handler (in `useMcpTool`) clears tool registrations.
 */
export function ensureWebMcp() {
  const registry = getActiveRegistry();
  if (!hasNativeModelContext()) installPolyfill(registry);
  return registry;
}

/**
 * Dev-only console helper. In `pnpm dev` (Vite dev build) this exposes
 * `window.webmcp` so you can manually test tools from the DevTools console:
 *
 *   webmcp.tools()                              // -> names of registered tools
 *   await webmcp.call('<tool_name>')
 *
 * Installed at module load (as soon as the conversation bundle imports this
 * file), and the registry is resolved lazily per call — so `window.webmcp`
 * exists even before any tool has registered (`tools()` is just `[]` until a
 * conversation is open). Stripped from production builds via the
 * `import.meta.env.DEV` dead-code branch.
 */
/**
 * Iframe → parent postMessage bridge for WebMCP tools.
 *
 * Call once at boot when chatwoot may run inside a cross-origin iframe.
 * Broadcasts the registry tool list to the parent whenever it changes and
 * handles tool-execution requests forwarded from the parent's proxy.
 * No-op when not embedded (`window === top`).
 *
 * Protocol (all types prefixed WEBMCP_):
 *   iframe → parent  TOOLS_UPDATE  { type, tools: [{name, description, inputSchema, …}] }
 *   parent → iframe  EXECUTE_TOOL  { type, requestId, name, args }
 *   iframe → parent  TOOL_RESULT   { type, requestId, result?, error? }
 *   parent → iframe  REQUEST_TOOLS { type }  — triggers an immediate re-broadcast
 */
export function startIframeBridge(registry) {
  if (typeof window === 'undefined' || window === window.top) return;

  function buildToolList() {
    return Array.from(registry.getTools().values()).map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema || { type: 'object', properties: {} },
      ...(t.outputSchema != null ? { outputSchema: t.outputSchema } : {}),
      ...(t.annotations != null ? { annotations: t.annotations } : {}),
    }));
  }

  function broadcast() {
    window.parent.postMessage({ type: 'WEBMCP_TOOLS_UPDATE', tools: buildToolList() }, '*');
  }

  registry.onToolsChanged(broadcast);
  // Immediate push — tools registered synchronously before this call are
  // already in the Map so this captures the baseline set.
  broadcast();

  window.addEventListener('message', async event => {
    if (event.source !== window.parent) return;
    const msg = event.data;
    if (!msg || typeof msg.type !== 'string') return;

    if (msg.type === 'WEBMCP_REQUEST_TOOLS') {
      broadcast();
      return;
    }

    if (msg.type === 'WEBMCP_EXECUTE_TOOL') {
      const { requestId, name, args } = msg;
      if (!requestId || !name) return;

      const tool = registry.getTools().get(name);
      if (!tool) {
        window.parent.postMessage(
          { type: 'WEBMCP_TOOL_RESULT', requestId, error: `Tool "${name}" not found` },
          '*'
        );
        return;
      }

      let result, error;
      try {
        result = await tool.execute(args || {}, { requestUserInteraction: cb => cb() });
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }

      window.parent.postMessage({ type: 'WEBMCP_TOOL_RESULT', requestId, result, error }, '*');
    }
  });
}

if (import.meta.env && import.meta.env.DEV && typeof window !== 'undefined') {
  window.webmcp = {
    tools: () => Array.from(getActiveRegistry().getTools().keys()),
    get: name => getActiveRegistry().getTools().get(name),
    call: (name, args = {}) => {
      const tool = getActiveRegistry().getTools().get(name);
      if (!tool) throw new Error(`No WebMCP tool named "${name}"`);
      return tool.execute(args, { requestUserInteraction: cb => cb() });
    },
  };
}
