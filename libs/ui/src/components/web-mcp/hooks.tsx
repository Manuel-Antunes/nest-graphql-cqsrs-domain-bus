'use client';

import * as React from 'react';
import { z } from 'zod';

import { getActiveRegistry, hasNativeModelContext } from './host';
import { WebMCPContext } from './provider';
import type {
  CallToolResult,
  RegisteredTool,
  RegisterToolOptions,
  ToolAnnotations,
  ToolDescriptor,
  ToolExecuteContext,
  ToolExecutionState,
  UseMcpToolConfigJsonSchema,
  UseMcpToolConfigZod,
  UseMcpToolOptions,
  UseMcpToolReturn,
  WebMcpInputSchema,
  WebMcpToolDefinition,
  WebMcpToolResult,
} from './types';
import {
  isAbortError,
  isDuplicateNameError,
  normalizeError,
} from './validation';
import { warnOnce } from './warn';

const useEffectEvent =
  (React as unknown as { useEffectEvent?: typeof React.useEffect })
    .useEffectEvent ||
  (React as unknown as { experimental_useEffectEvent?: typeof React.useEffect })
    .experimental_useEffectEvent;

interface OwnerEntry {
  owner: symbol;
  controller: AbortController;
}

const TOOL_OWNERS_BY_NAME = new Map<string, OwnerEntry>();

export function _resetToolOwners(): void {
  TOOL_OWNERS_BY_NAME.clear();
}

export function abortToolByName(name: string): void {
  const entry = TOOL_OWNERS_BY_NAME.get(name);
  if (!entry) return;
  entry.controller.abort();
  TOOL_OWNERS_BY_NAME.delete(name);
}

export function purgeAllImperativeTools(): void {
  for (const [name, entry] of TOOL_OWNERS_BY_NAME) {
    entry.controller.abort();
    TOOL_OWNERS_BY_NAME.delete(name);
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    for (const entry of TOOL_OWNERS_BY_NAME.values()) {
      entry.controller.abort();
    }
    TOOL_OWNERS_BY_NAME.clear();
  });
}

function schemaFingerprint(schema: unknown): string {
  if (!schema) return '';
  if (schema instanceof z.ZodType) {
    try {
      return JSON.stringify(z.toJSONSchema(schema));
    } catch {
      return String(schema);
    }
  }
  try {
    return JSON.stringify(schema);
  } catch {
    return String(schema);
  }
}

function zodToJsonSchema(schema: z.ZodTypeAny): WebMcpInputSchema {
  return z.toJSONSchema(schema) as unknown as WebMcpInputSchema;
}

const INITIAL_STATE: ToolExecutionState = {
  isExecuting: false,
  lastResult: null,
  error: null,
  executionCount: 0,
};

export function useMcpTool<TInputShape extends z.ZodRawShape>(
  config: UseMcpToolConfigZod<TInputShape>,
  options?: UseMcpToolOptions,
): UseMcpToolReturn;
export function useMcpTool(
  config: UseMcpToolConfigJsonSchema,
  options?: UseMcpToolOptions,
): UseMcpToolReturn;
export function useMcpTool(
  config: UseMcpToolConfigZod<z.ZodRawShape> | UseMcpToolConfigJsonSchema,
  options: UseMcpToolOptions = {},
): UseMcpToolReturn {
  const { enabled = true } = options;

  const { modelContext: providerModelContext } =
    React.useContext(WebMCPContext);

  const [state, setState] = React.useState<ToolExecutionState>(INITIAL_STATE);

  const handlerRef = React.useRef(config.handler);
  const onSuccessRef = React.useRef(config.onSuccess);
  const onErrorRef = React.useRef(config.onError);
  const isMountedRef = React.useRef(true);
  const inFlightRef = React.useRef(0);
  const controllerRef = React.useRef<AbortController | null>(null);

  handlerRef.current = config.handler;
  onSuccessRef.current = config.onSuccess;
  onErrorRef.current = config.onError;

  React.useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const isZod =
    'input' in config &&
    (config as UseMcpToolConfigZod<z.ZodRawShape>).input instanceof z.ZodType;

  const inputFingerprint = schemaFingerprint(
    isZod
      ? (config as UseMcpToolConfigZod<z.ZodRawShape>).input
      : (config as UseMcpToolConfigJsonSchema).inputSchema,
  );
  const annotationsFingerprint = config.annotations
    ? JSON.stringify(config.annotations)
    : '';
  const exposedToFingerprint = config.exposedTo
    ? config.exposedTo.join(',')
    : '';

  const runHandler = React.useCallback(
    async (
      input: Record<string, unknown>,
      context: ToolExecuteContext,
    ): Promise<CallToolResult> => {
      inFlightRef.current += 1;
      if (isMountedRef.current) {
        setState((prev) => ({ ...prev, isExecuting: true, error: null }));
      }

      try {
        let validated: Record<string, unknown> = input ?? {};
        if (isZod) {
          validated = (
            config as UseMcpToolConfigZod<z.ZodRawShape>
          ).input.parse(validated);
        }

        const result = await handlerRef.current(validated as never, context);

        inFlightRef.current = Math.max(0, inFlightRef.current - 1);
        if (isMountedRef.current) {
          setState((prev) => ({
            isExecuting: inFlightRef.current > 0,
            lastResult: result,
            error: null,
            executionCount: prev.executionCount + 1,
          }));
        }
        onSuccessRef.current?.(result);
        return result;
      } catch (thrown) {
        const error =
          thrown instanceof Error ? thrown : new Error(String(thrown));
        inFlightRef.current = Math.max(0, inFlightRef.current - 1);
        if (isMountedRef.current) {
          setState((prev) => ({
            ...prev,
            isExecuting: inFlightRef.current > 0,
            error,
          }));
        }
        onErrorRef.current?.(error);
        throw error;
      }
      // The deps below cover the parts of `config` that change behaviour.
      // We read `config` afresh on each invocation through narrowing, so
      // `exhaustive-deps` would flag it — but re-binding on every render
      // would defeat the ref pattern.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [isZod, inputFingerprint],
  );

  const execute = React.useCallback(
    (input?: Record<string, unknown>): Promise<CallToolResult> =>
      runHandler(input ?? {}, {}),
    [runHandler],
  );

  const reset = React.useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  React.useEffect(() => {
    if (!enabled) return;
    if (typeof document === 'undefined') return;

    const mc = document.modelContext;
    if (!mc) {
      warnOnce(
        'no-model-context',
        'No `document.modelContext` found. Tools will not be visible to any ' +
          'agent. Wrap the tree in <WebMCPProvider> for the polyfill, or ' +
          'enable chrome://flags/#enable-webmcp-testing for the real API.',
      );
      return;
    }

    const resolvedInputSchema: WebMcpInputSchema = isZod
      ? zodToJsonSchema((config as UseMcpToolConfigZod<z.ZodRawShape>).input)
      : ((config as UseMcpToolConfigJsonSchema).inputSchema ?? {
          type: 'object',
          properties: {},
        });

    const annotations: ToolAnnotations = { ...config.annotations };
    if (config.readOnly !== undefined) {
      annotations.readOnlyHint = Boolean(config.readOnly);
    }
    if (annotations.readOnlyHint !== undefined) {
      annotations.readOnlyHint = Boolean(annotations.readOnlyHint);
    }
    if (annotations.untrustedContentHint !== undefined) {
      annotations.untrustedContentHint = Boolean(
        annotations.untrustedContentHint,
      );
    }
    const hasAnnotations = Object.keys(annotations).length > 0;

    const owner = Symbol(config.name);
    const controller = new AbortController();
    controllerRef.current = controller;

    const previous = TOOL_OWNERS_BY_NAME.get(config.name);
    if (previous) previous.controller.abort();
    TOOL_OWNERS_BY_NAME.set(config.name, { owner, controller });

    const descriptor: ToolDescriptor = {
      name: config.name,
      ...(config.title ? { title: config.title } : {}),
      description: config.description,
      inputSchema: resolvedInputSchema,
      ...(hasAnnotations ? { annotations } : {}),
      execute: async (args, context) => {
        try {
          return await runHandler(
            (args ?? {}) as Record<string, unknown>,
            context ?? {},
          );
        } catch (thrown) {
          const message =
            thrown instanceof Error ? thrown.message : String(thrown);
          return {
            content: [{ type: 'text', text: `Error: ${message}` }],
            isError: true,
          } satisfies CallToolResult;
        }
      },
    };

    const registerOptions: RegisterToolOptions = {
      signal: controller.signal,
      ...(config.exposedTo?.length ? { exposedTo: config.exposedTo } : {}),
    };

    const registry = getActiveRegistry();
    const mirrorsRegistry = !hasNativeModelContext();
    if (!mirrorsRegistry) {
      registry.registerTool(descriptor, { signal: controller.signal });
    }

    let cancelled = false;

    const reportRegistrationFailure = (thrown: unknown): void => {
      const error = normalizeError(thrown);
      if (isAbortError(error)) return;

      const claimed = TOOL_OWNERS_BY_NAME.get(config.name);
      if (claimed?.owner === owner) {
        TOOL_OWNERS_BY_NAME.delete(config.name);
      }
      if (isMountedRef.current) {
        setState((prev) => ({ ...prev, error }));
      }
      onErrorRef.current?.(error);
      console.warn(`[WebMCP] registerTool failed for "${config.name}":`, error);
    };

    void (async () => {
      try {
        await mc.registerTool(descriptor, registerOptions);
      } catch (thrown) {
        if (cancelled || controller.signal.aborted) return;
        const error = normalizeError(thrown);

        if (isDuplicateNameError(error)) {
          await new Promise((resolve) => setTimeout(resolve, 0));
          if (cancelled || controller.signal.aborted) return;
          try {
            await mc.registerTool(descriptor, registerOptions);
            return;
          } catch (retryError) {
            if (cancelled || controller.signal.aborted) return;
            reportRegistrationFailure(retryError);
            return;
          }
        }

        reportRegistrationFailure(error);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      if (controllerRef.current === controller) controllerRef.current = null;
      if (!mirrorsRegistry) registry.unregisterTool(config.name);

      const claimed = TOOL_OWNERS_BY_NAME.get(config.name);
      if (claimed?.owner === owner) {
        TOOL_OWNERS_BY_NAME.delete(config.name);
      }
    };
    // Deps: anything that affects the descriptor shape. We rely on refs
    // for the callbacks so they're intentionally excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    config.name,
    config.title,
    config.description,
    inputFingerprint,
    annotationsFingerprint,
    exposedToFingerprint,
    config.readOnly,
    enabled,
    isZod,
    runHandler,
    providerModelContext,
  ]);

  return { state, execute: execute as never, reset };
}

export function useTool<T = unknown>(
  definition: WebMcpToolDefinition<T>,
  options: UseMcpToolOptions = {},
): void {
  const adapted = React.useMemo(
    () =>
      definition.parameters instanceof z.ZodObject
        ? ({
            name: definition.name,
            title: definition.title,
            description: definition.description,
            input: definition.parameters,
            annotations: definition.annotations,
            readOnly: definition.readOnly,
            handler: async (args: Record<string, unknown>) =>
              (await Promise.resolve(
                definition.execute(args as T),
              )) as WebMcpToolResult,
          } satisfies UseMcpToolConfigZod<z.ZodRawShape>)
        : ({
            name: definition.name,
            title: definition.title,
            description: definition.description,
            inputSchema: undefined,
            annotations: definition.annotations,
            readOnly: definition.readOnly,
            handler: async (args: Record<string, unknown>) =>
              (await Promise.resolve(
                definition.execute(args as T),
              )) as WebMcpToolResult,
          } satisfies UseMcpToolConfigJsonSchema),
    [
      definition.name,
      definition.title,
      definition.description,
      definition.parameters,
      definition.annotations,
      definition.readOnly,
      definition.execute,
    ],
  );

  useMcpTool(adapted as never, options);
}

export function useToolActivated(options: {
  toolName?: string;
  onActivated?: (toolName: string) => void;
  onCancel?: (toolName: string) => void;
}): void {
  const onActivated = useEffectEvent
    ? (useEffectEvent as (cb: (n: string) => void) => (n: string) => void)(
        (toolName: string) => {
          options.onActivated?.(toolName);
        },
      )
    : (toolName: string) => options.onActivated?.(toolName);

  const onCancel = useEffectEvent
    ? (useEffectEvent as (cb: (n: string) => void) => (n: string) => void)(
        (toolName: string) => {
          options.onCancel?.(toolName);
        },
      )
    : (toolName: string) => options.onCancel?.(toolName);

  React.useEffect(() => {
    const handleActivated = (e: ToolActivatedEvent) => {
      if (options.toolName && e.toolName !== options.toolName) return;
      onActivated(e.toolName);
    };
    const handleCancel = (e: ToolActivatedEvent) => {
      if (options.toolName && e.toolName !== options.toolName) return;
      onCancel(e.toolName);
    };
    window.addEventListener('toolactivated', handleActivated);
    window.addEventListener('toolcancel', handleCancel);
    return () => {
      window.removeEventListener('toolactivated', handleActivated);
      window.removeEventListener('toolcancel', handleCancel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.toolName]);
}

export interface UseWebMcpToolsOptions {
  fromOrigins?: string[];
  enabled?: boolean;
}

export function useWebMcpTools(options: UseWebMcpToolsOptions = {}) {
  const { enabled = true } = options;
  const fromOriginsKey = options.fromOrigins
    ? options.fromOrigins.join(',')
    : '';
  const { modelContext: providerModelContext } =
    React.useContext(WebMCPContext);

  const [tools, setTools] = React.useState<RegisteredTool[]>([]);

  React.useEffect(() => {
    if (!enabled) return;
    if (typeof document === 'undefined' || !document.modelContext) return;
    const mc = document.modelContext;
    const fromOrigins = fromOriginsKey ? fromOriginsKey.split(',') : undefined;
    let cancelled = false;

    const refresh = () => {
      void mc
        .getTools(fromOrigins ? { fromOrigins } : undefined)
        .then((next) => {
          if (!cancelled) setTools(next);
        })
        .catch(() => {
          if (!cancelled) setTools([]);
        });
    };

    refresh();
    mc.addEventListener('toolchange', refresh);
    return () => {
      cancelled = true;
      mc.removeEventListener('toolchange', refresh);
    };
  }, [enabled, fromOriginsKey, providerModelContext]);

  return tools;
}
