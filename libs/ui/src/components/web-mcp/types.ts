import type { z } from 'zod';

export interface StandardSchemaV1<Input = unknown, Output = Input> {
  readonly '~standard': {
    version: 1;
    vendor: string;
    validate: (value: unknown) => unknown;
  };
}

export interface WebMcpContent {
  type: string;
  text: string;
  [key: string]: unknown;
}

export interface WebMcpToolResult {
  content: WebMcpContent[];
}

export interface CallToolResult {
  content: Array<{ type: string; text?: string; [key: string]: unknown }>;
  isError?: boolean;
}

export interface WebMcpInputSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
}

export interface ToolAnnotations {
  readOnlyHint?: boolean;
  untrustedContentHint?: boolean;
  [key: string]: unknown;
}

export interface ToolExecuteContext {
  signal?: AbortSignal;
}

export type ToolExecuteFn<
  TArgs extends Record<string, unknown> = Record<string, unknown>,
  TResult = CallToolResult,
> = (args: TArgs, context: ToolExecuteContext) => TResult | Promise<TResult>;

export interface ToolDescriptor {
  name: string;
  title?: string;
  description: string;
  inputSchema?: WebMcpInputSchema;
  annotations?: ToolAnnotations;
  execute: ToolExecuteFn<Record<string, unknown>, unknown>;
}

export type ModelContextTool = ToolDescriptor;

export interface RegisterToolOptions {
  signal?: AbortSignal;
  exposedTo?: string[];
}

export interface GetToolsOptions {
  fromOrigins?: string[];
}

export interface ExecuteToolOptions {
  signal?: AbortSignal;
}

export interface RegisteredTool {
  name: string;
  title?: string;
  description: string;
  inputSchema?: string | Record<string, unknown>;
  annotations?: ToolAnnotations;
  origin: string;
  window: Window;
}

export interface RegistryInternal {
  registerTool(tool: ToolDescriptor, options?: RegisterToolOptions): void;
  unregisterTool(name: string): void;
  getTools(): ReadonlyMap<string, ToolDescriptor>;
  onToolsChanged(callback: (() => void) | null): void;
  addChangeListener(callback: () => void): () => void;
}

export interface ModelContextAPI extends EventTarget {
  registerTool(
    tool: ToolDescriptor,
    options?: RegisterToolOptions,
  ): Promise<void>;
  getTools(options?: GetToolsOptions): Promise<RegisteredTool[]>;
  executeTool(
    tool: RegisteredTool,
    inputObject?: string | Record<string, unknown>,
    options?: ExecuteToolOptions,
  ): Promise<string>;
  ontoolchange: ((this: ModelContextAPI, ev: Event) => unknown) | null;
}

interface UseMcpToolConfigBase<
  TResult extends CallToolResult = CallToolResult,
> {
  name: string;
  title?: string;
  description: string;
  annotations?: ToolAnnotations;
  readOnly?: boolean;
  exposedTo?: string[];
  onSuccess?: (result: TResult) => void;
  onError?: (error: Error) => void;
}

export interface UseMcpToolConfigZod<
  TInputShape extends z.ZodRawShape = z.ZodRawShape,
  TResult extends CallToolResult = CallToolResult,
> extends UseMcpToolConfigBase<TResult> {
  input: z.ZodObject<TInputShape>;
  handler: (
    args: z.infer<z.ZodObject<TInputShape>>,
    context: ToolExecuteContext,
  ) => TResult | Promise<TResult>;
}

export interface UseMcpToolConfigJsonSchema<
  TResult extends CallToolResult = CallToolResult,
> extends UseMcpToolConfigBase<TResult> {
  inputSchema?: WebMcpInputSchema;
  handler: ToolExecuteFn<Record<string, unknown>, TResult>;
}

export interface UseMcpToolOptions {
  enabled?: boolean;
}

export interface ToolExecutionState<
  TResult extends CallToolResult = CallToolResult,
> {
  isExecuting: boolean;
  lastResult: TResult | null;
  error: Error | null;
  executionCount: number;
}

export interface UseMcpToolReturn<
  TResult extends CallToolResult = CallToolResult,
> {
  state: ToolExecutionState<TResult>;
  execute: (input?: Record<string, unknown>) => Promise<TResult>;
  reset: () => void;
}

export interface WebMCPStatus {
  available: boolean;
  native: boolean;
}

export interface WebMCPProviderProps {
  name?: string;
  version?: string;
  forcePolyfill?: boolean;
  children?: React.ReactNode;
}

export interface WebMcpToolDefinition<T = unknown> {
  name: string;
  title?: string;
  description: string;
  parameters: z.ZodType<T> | StandardSchemaV1<T>;
  annotations?: ToolAnnotations;
  readOnly?: boolean;
  execute: (args: T) => WebMcpToolResult | Promise<WebMcpToolResult>;
}

declare global {
  interface Document {
    readonly modelContext?: ModelContextAPI;
  }
  interface ToolActivatedEvent extends Event {
    toolName: string;
  }
  interface SubmitEvent {
    readonly agentInvoked?: boolean;
    respondWith?(result: Promise<unknown>): void;
  }
  interface WebMcpSubmitEvent extends SubmitEvent {
    agentInvoked: boolean;
    respondWith: (result: Promise<unknown>) => void;
  }
  interface WindowEventMap {
    toolactivated: ToolActivatedEvent;
    toolcancel: ToolActivatedEvent;
  }
}

declare module 'react' {
  interface FormHTMLAttributes<T> {
    toolname?: string;
    tooldescription?: string;
    toolautosubmit?: '' | boolean;
  }
  interface InputHTMLAttributes<T> {
    toolparamdescription?: string;
  }
  interface SelectHTMLAttributes<T> {
    toolparamdescription?: string;
  }
  interface TextareaHTMLAttributes<T> {
    toolparamdescription?: string;
  }
  interface FieldsetHTMLAttributes<T> {
    toolparamdescription?: string;
  }
}
