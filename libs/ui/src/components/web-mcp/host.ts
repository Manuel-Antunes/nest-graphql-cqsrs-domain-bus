import type {
  ExecuteToolOptions,
  GetToolsOptions,
  ModelContextAPI,
  RegisteredTool,
  RegisterToolOptions,
  RegistryInternal,
  ToolDescriptor,
} from './types';
import {
  isPotentiallyTrustworthyOrigin,
  isValidToolName,
  validateArgs,
} from './validation';

const POLYFILL_MARKER = '__isWebMCPPolyfill';

export function createRegistry(): RegistryInternal {
  const tools = new Map<string, ToolDescriptor>();
  const listeners = new Set<() => void>();
  let notificationPending = false;

  function scheduleNotification(): void {
    if (notificationPending) return;
    notificationPending = true;
    queueMicrotask(() => {
      notificationPending = false;
      for (const listener of listeners) listener();
    });
  }

  function validate(
    tool: ToolDescriptor,
    options: RegisterToolOptions | undefined,
  ): void {
    if (!isValidToolName(tool.name)) {
      throw new DOMException(
        'Tool name must be 1-128 characters of [A-Za-z0-9_.-]',
        'InvalidStateError',
      );
    }
    if (typeof tool.description !== 'string' || tool.description === '') {
      throw new DOMException(
        'Tool description must be a non-empty string',
        'InvalidStateError',
      );
    }
    if (typeof tool.execute !== 'function') {
      throw new DOMException(
        'Tool execute must be a function',
        'InvalidStateError',
      );
    }
    if (tool.inputSchema !== undefined) {
      try {
        JSON.stringify(tool.inputSchema);
      } catch {
        throw new TypeError('Tool inputSchema is not JSON-serializable');
      }
    }
    for (const origin of options?.exposedTo ?? []) {
      if (!isPotentiallyTrustworthyOrigin(origin)) {
        throw new DOMException(
          `exposedTo origin "${origin}" is not a secure origin`,
          'SecurityError',
        );
      }
    }
  }

  function addChangeListener(callback: () => void): () => void {
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
    };
  }

  let singleSlotUnsubscribe: (() => void) | null = null;

  return {
    registerTool(tool, options) {
      validate(tool, options);

      if (options?.signal?.aborted) {
        return;
      }

      const previous = tools.get(tool.name);
      if (previous) {
        tools.delete(tool.name);
      }

      const stored: ToolDescriptor = {
        ...tool,
        inputSchema: tool.inputSchema ?? { type: 'object', properties: {} },
      };
      tools.set(tool.name, stored);
      scheduleNotification();

      if (options?.signal) {
        const name = tool.name;
        options.signal.addEventListener(
          'abort',
          () => {
            if (tools.get(name) === stored && tools.delete(name)) {
              scheduleNotification();
            }
          },
          { once: true },
        );
      }
    },

    unregisterTool(name) {
      if (tools.delete(name)) {
        scheduleNotification();
      }
    },

    getTools() {
      return tools;
    },

    onToolsChanged(cb) {
      if (singleSlotUnsubscribe) {
        singleSlotUnsubscribe();
        singleSlotUnsubscribe = null;
      }
      if (cb) singleSlotUnsubscribe = addChangeListener(cb);
    },

    addChangeListener,
  };
}

class ModelContextPolyfill extends EventTarget implements ModelContextAPI {
  readonly [POLYFILL_MARKER] = true as const;

  #registry: RegistryInternal;
  #unsubscribe: (() => void) | null = null;
  #ontoolchange: ((this: ModelContextAPI, ev: Event) => unknown) | null = null;

  constructor(registry: RegistryInternal) {
    super();
    this.#registry = registry;
    this.#subscribe();
  }

  get ontoolchange(): ((this: ModelContextAPI, ev: Event) => unknown) | null {
    return this.#ontoolchange;
  }

  set ontoolchange(handler:
    | ((this: ModelContextAPI, ev: Event) => unknown)
    | null,) {
    if (this.#ontoolchange) {
      this.removeEventListener(
        'toolchange',
        this.#ontoolchange as unknown as EventListener,
      );
    }
    this.#ontoolchange = handler;
    if (handler) {
      this.addEventListener('toolchange', handler as unknown as EventListener);
    }
  }

  setRegistry(registry: RegistryInternal): void {
    this.#registry = registry;
    this.#subscribe();
  }

  #subscribe(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = this.#registry.addChangeListener(() => {
      this.dispatchEvent(new Event('toolchange'));
    });
  }

  dispose(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
  }

  registerTool(
    tool: ToolDescriptor,
    options?: RegisterToolOptions,
  ): Promise<void> {
    try {
      this.#registry.registerTool(tool, options);
      return Promise.resolve();
    } catch (error) {
      return Promise.reject(error);
    }
  }

  getTools(options?: GetToolsOptions): Promise<RegisteredTool[]> {
    void options;
    const origin = typeof location !== 'undefined' ? location.origin : 'null';
    const registered: RegisteredTool[] = [];
    for (const tool of this.#registry.getTools().values()) {
      registered.push({
        name: tool.name,
        title: tool.title ?? '',
        description: tool.description,
        inputSchema: JSON.stringify(
          tool.inputSchema ?? { type: 'object', properties: {} },
        ),
        ...(tool.annotations ? { annotations: tool.annotations } : {}),
        origin,
        window: globalThis.window,
      });
    }
    registered.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    return Promise.resolve(registered);
  }

  async executeTool(
    tool: RegisteredTool,
    inputObject: string | Record<string, unknown> = {},
    options?: ExecuteToolOptions,
  ): Promise<string> {
    const descriptor = this.#registry.getTools().get(tool?.name);
    if (!descriptor) {
      throw new DOMException(
        `No tool named "${tool?.name}" is registered`,
        'NotFoundError',
      );
    }

    let args: Record<string, unknown>;
    try {
      args =
        typeof inputObject === 'string'
          ? (JSON.parse(inputObject || '{}') as Record<string, unknown>)
          : inputObject;
    } catch {
      throw new DOMException('Failed to parse input arguments', 'UnknownError');
    }

    validateArgs(args, descriptor.inputSchema);

    const controller = new AbortController();
    if (options?.signal) {
      if (options.signal.aborted) controller.abort(options.signal.reason);
      else
        options.signal.addEventListener(
          'abort',
          () => controller.abort(options.signal?.reason),
          { once: true },
        );
    }

    const result = await descriptor.execute(args, {
      signal: controller.signal,
    });
    return typeof result === 'string' ? result : JSON.stringify(result);
  }
}

let previousDescriptor: PropertyDescriptor | undefined;

function getPolyfill(): ModelContextPolyfill | null {
  if (typeof document === 'undefined') return null;
  const mc = document.modelContext as
    | (ModelContextAPI & { [POLYFILL_MARKER]?: true })
    | undefined;
  return mc && mc[POLYFILL_MARKER] ? (mc as ModelContextPolyfill) : null;
}

export function hasNativeModelContext(): boolean {
  return (
    typeof document !== 'undefined' && !!document.modelContext && !getPolyfill()
  );
}

export function installPolyfill(
  registry: RegistryInternal,
  options: { force?: boolean } = {},
): boolean {
  if (typeof document === 'undefined') return false;

  const existing = getPolyfill();
  if (existing) {
    existing.setRegistry(registry);
    return true;
  }

  if (document.modelContext && !options.force) return false;

  previousDescriptor = Object.getOwnPropertyDescriptor(
    document,
    'modelContext',
  );

  Object.defineProperty(document, 'modelContext', {
    value: new ModelContextPolyfill(registry),
    configurable: true,
    enumerable: false,
    writable: false,
  });
  return true;
}

export function cleanupPolyfill(): void {
  const polyfill = getPolyfill();
  if (!polyfill) return;
  polyfill.dispose();
  if (previousDescriptor) {
    Object.defineProperty(document, 'modelContext', previousDescriptor);
  } else {
    delete (document as Document & { modelContext?: ModelContextAPI })
      .modelContext;
  }
  previousDescriptor = undefined;
}

let activeRegistry: RegistryInternal | null = null;

export function setActiveRegistry(registry: RegistryInternal | null): void {
  activeRegistry = registry;
}

export function getActiveRegistry(): RegistryInternal {
  if (!activeRegistry) {
    activeRegistry = createRegistry();
  }
  return activeRegistry;
}
