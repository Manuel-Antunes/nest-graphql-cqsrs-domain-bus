/**
 * `useMcpTool` — Vue composable port of the web app's React hook
 * (`libs/ui/src/components/web-mcp/hooks.tsx`).
 *
 * Registers an imperative tool against `navigator.modelContext` (or the
 * polyfilled registry) for the lifetime of the calling component, and returns
 * reactive execution state plus a programmatic `execute`.
 *
 *   const { state, execute, reset } = useMcpTool({
 *     name: 'get_current_conversation',
 *     description: 'Return the conversation the agent is currently viewing',
 *     readOnly: true,
 *     inputSchema: { type: 'object', properties: {} },
 *     handler: async () => ({ content: [{ type: 'text', text: '…' }] }),
 *   });
 *
 * Differences from the React version (intentional):
 * - JSON-Schema only — no Zod dependency in chatwoot. Pass `inputSchema`
 *   directly (Chrome's native API wants JSON Schema anyway).
 * - Vue `setup()` runs once, so the handler is captured directly — no
 *   `handlerRef` indirection is needed to avoid stale closures.
 * - Lifecycle uses `onScopeDispose` instead of an effect cleanup.
 */
import { reactive, unref, watch, onScopeDispose, getCurrentScope } from 'vue';
import { ensureWebMcp, getActiveRegistry } from './host';

// ---------------------------------------------------------------------------
// Module-level ownership map — the idempotent-by-name guard. Each successful
// registration claims a slot; cleanup only evicts when the owning token still
// matches, so a late-firing cleanup can't remove a newer registration.
// ---------------------------------------------------------------------------
const TOOL_OWNERS_BY_NAME = new Map();

/** Abort the registration for a tool name, whoever owns it. */
export function abortToolByName(name) {
  const entry = TOOL_OWNERS_BY_NAME.get(name);
  if (!entry) return;
  entry.controller.abort();
  TOOL_OWNERS_BY_NAME.delete(name);
}

/** Abort every active imperative tool registration. */
export function purgeAllImperativeTools() {
  TOOL_OWNERS_BY_NAME.forEach(entry => entry.controller.abort());
  TOOL_OWNERS_BY_NAME.clear();
}

function releaseOwnership(name, owner) {
  const claimed = TOOL_OWNERS_BY_NAME.get(name);
  if (claimed && claimed.owner === owner) TOOL_OWNERS_BY_NAME.delete(name);
}

// Tab close / bfcache fallback. Runs once at module load.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    TOOL_OWNERS_BY_NAME.forEach(entry => entry.controller.abort());
    TOOL_OWNERS_BY_NAME.clear();
  });
}

const createInitialState = () => ({
  isExecuting: false,
  lastResult: null,
  error: null,
  executionCount: 0,
});

export function useMcpTool(config, options = {}) {
  const enabledSource = options.enabled === undefined ? true : options.enabled;
  const state = reactive(createInitialState());

  let inFlight = 0;
  let disposed = false;
  let currentController = null;
  let currentOwner = null;

  // Shared state machine for both the agent path (descriptor.execute) and the
  // programmatic path (returned `execute`). `agentPath` controls error
  // behaviour: agents get an `isError` result, callers get a thrown error.
  async function runHandler(rawArgs, agentPath) {
    inFlight += 1;
    state.isExecuting = true;
    state.error = null;

    const client = { requestUserInteraction: cb => cb() };

    try {
      const result = await config.handler(rawArgs || {}, client);
      inFlight = Math.max(0, inFlight - 1);
      if (!disposed) {
        state.isExecuting = inFlight > 0;
        state.lastResult = result;
        state.error = null;
        state.executionCount += 1;
      }
      if (config.onSuccess) config.onSuccess(result);
      return result;
    } catch (thrown) {
      const error =
        thrown instanceof Error ? thrown : new Error(String(thrown));
      inFlight = Math.max(0, inFlight - 1);
      if (!disposed) {
        state.isExecuting = inFlight > 0;
        state.error = error;
      }
      if (config.onError) config.onError(error);
      if (agentPath) {
        // Agents expect a result, not a throw — surface the error as one.
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true,
        };
      }
      throw error;
    }
  }

  const execute = input => runHandler(input || {}, false);
  const reset = () => {
    Object.assign(state, createInitialState());
  };

  function register() {
    if (typeof navigator === 'undefined') return;
    ensureWebMcp();
    const mc = navigator.modelContext;
    if (!mc) return;

    const annotations = { ...config.annotations };
    if (config.readOnly) annotations.readOnlyHint = 'true';

    const owner = Symbol(config.name);
    const controller = new AbortController();
    currentController = controller;
    currentOwner = owner;

    // Take ownership: abort any previous controller for this name first.
    const previous = TOOL_OWNERS_BY_NAME.get(config.name);
    if (previous) previous.controller.abort();
    TOOL_OWNERS_BY_NAME.set(config.name, { owner, controller });

    const descriptor = {
      name: config.name,
      description: config.description,
      inputSchema: config.inputSchema || { type: 'object', properties: {} },
      ...(config.outputSchema ? { outputSchema: config.outputSchema } : {}),
      ...(config.annotations || config.readOnly ? { annotations } : {}),
      execute: args => runHandler(args, true),
    };

    const registry = getActiveRegistry();

    // Native modelContext (Chrome 146+) throws on a duplicate name, unlike the
    // polyfill which replaces in place. Defensively unregister first.
    const safeRegister = () => {
      try {
        if (mc.unregisterTool) mc.unregisterTool(config.name);
      } catch (e) {
        // unregisterTool isn't required by the native spec; ignore.
      }
      mc.registerTool(descriptor, { signal: controller.signal });
      registry.registerTool(descriptor, { signal: controller.signal });
    };

    try {
      safeRegister();
    } catch (err) {
      const isDuplicate =
        err instanceof DOMException &&
        (err.name === 'InvalidStateError' ||
          /duplicate tool name/i.test(err.message));

      if (isDuplicate) {
        try {
          if (mc.unregisterTool) mc.unregisterTool(config.name);
          registry.unregisterTool(config.name);
          mc.registerTool(descriptor, { signal: controller.signal });
          registry.registerTool(descriptor, { signal: controller.signal });
        } catch (retryErr) {
          releaseOwnership(config.name, owner);
          currentController = null;
          currentOwner = null;
          // eslint-disable-next-line no-console
          console.warn(
            `[WebMCP] registerTool failed for "${config.name}" after retry:`,
            retryErr
          );
        }
      } else {
        releaseOwnership(config.name, owner);
        currentController = null;
        currentOwner = null;
        // eslint-disable-next-line no-console
        console.warn(`[WebMCP] registerTool failed for "${config.name}":`, err);
      }
    }
  }

  function unregister() {
    if (currentController) currentController.abort();
    currentController = null;

    const mc = typeof navigator !== 'undefined' ? navigator.modelContext : null;
    if (mc && mc.unregisterTool) mc.unregisterTool(config.name);
    getActiveRegistry().unregisterTool(config.name);

    if (currentOwner) {
      releaseOwnership(config.name, currentOwner);
      currentOwner = null;
    }
  }

  // `enabled` may be a static boolean or a ref/getter — react to it.
  const stopWatch = watch(
    () => unref(enabledSource),
    enabled => {
      if (enabled) register();
      else unregister();
    },
    { immediate: true }
  );

  if (getCurrentScope()) {
    onScopeDispose(() => {
      disposed = true;
      stopWatch();
      unregister();
    });
  }

  return { state, execute, reset };
}
