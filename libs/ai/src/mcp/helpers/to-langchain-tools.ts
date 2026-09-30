import { Type } from '@nestjs/common';
import {
  MCP_TOOL_METADATA_KEY,
  type Context as McpContext,
  ToolOptions,
} from '@rekog/mcp-nest';
import { StructuredTool, tool } from 'langchain';
import { z } from 'zod';

type ToLangchainToolsOptions<T> = {
  instance?: T;
  instanceFactory?: (thisArg: unknown) => T | Promise<T>;
  thisArg?: unknown;
  includeInherited?: boolean;
  mcpServer?: McpContext['mcpServer'];
  contextFactory?: (args: {
    name: string;
    input: unknown;
    runtime: unknown;
    defaultContext: McpContext;
  }) => unknown | Promise<unknown>;
};

type ToolMethod = { name: string; method: (...args: unknown[]) => unknown };

const defaultLogger: McpContext['log'] = {
  debug: () => undefined,
  error: () => undefined,
  info: () => undefined,
  warn: () => undefined,
};

function normalizeToolArguments(input: unknown): Record<string, unknown> {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  return { input } as Record<string, unknown>;
}

function buildMcpContext(args: {
  name: string;
  input: unknown;
  runtime: any;
  toolMetadata?: Record<string, unknown>;
  toolExtras?: Record<string, unknown>;
  mcpServer?: McpContext['mcpServer'];
}): McpContext {
  const runtimeConfig = args.runtime?.config ?? args.runtime;
  const runtimeTags = args.runtime?.tags ?? runtimeConfig?.tags ?? undefined;
  const runtimeMetadata =
    args.runtime?.metadata ?? runtimeConfig?.metadata ?? undefined;
  const toolCall = args.runtime?.toolCall ?? runtimeConfig?.toolCall;
  const meta: Record<string, unknown> = {
    ...(args.toolMetadata ?? {}),
    ...(runtimeMetadata ?? {}),
  };

  if (runtimeTags?.length) {
    meta.tags = runtimeTags;
  }
  if (args.toolExtras && Object.keys(args.toolExtras).length > 0) {
    meta.extras = args.toolExtras;
  }
  if (toolCall) {
    meta.toolCall = toolCall;
  }
  if (args.runtime?.toolCallId) {
    meta.toolCallId = args.runtime.toolCallId;
  }

  return {
    reportProgress: async (progress) => {
      if (args.runtime?.writer) {
        args.runtime.writer({ kind: 'progress', progress });
      }
    },
    log: defaultLogger,
    mcpServer:
      args.runtime?.context?.mcpServer ??
      args.mcpServer ??
      ({} as McpContext['mcpServer']),
    mcpRequest: {
      method: 'tools/call',
      params: {
        name: args.name,
        arguments: normalizeToolArguments(args.input),
        _meta: Object.keys(meta).length > 0 ? meta : undefined,
      },
    },
  };
}

function collectToolMethods(
  prototype: object,
  includeInherited: boolean,
): ToolMethod[] {
  const methods: ToolMethod[] = [];
  const seen = new Set<string>();
  let current: object | null = prototype;

  while (current && current !== Object.prototype) {
    for (const name of Object.getOwnPropertyNames(current)) {
      if (name === 'constructor' || seen.has(name)) continue;
      const descriptor = Object.getOwnPropertyDescriptor(current, name);
      if (!descriptor || typeof descriptor.value !== 'function') continue;
      methods.push({ name, method: descriptor.value });
      seen.add(name);
    }

    current = includeInherited ? Object.getPrototypeOf(current) : null;
  }

  return methods;
}

export function ToLangchainTools<T extends object>(
  Class: Type<T>,
  options: ToLangchainToolsOptions<T> = {},
): StructuredTool[] {
  const methods = collectToolMethods(
    Class.prototype,
    options.includeInherited ?? true,
  );
  const tools: StructuredTool[] = [];
  const usedNames = new Set<string>();
  let resolvedInstance: T | undefined;
  let resolvingInstance: Promise<T> | undefined;

  const resolveInstance = async () => {
    if (options.instance) return options.instance;
    if (resolvedInstance) return resolvedInstance;
    if (resolvingInstance) return resolvingInstance;
    if (!options.instanceFactory) {
      throw new Error(
        'MCP tools are not bound to an instance. ' +
          'Pass { instance } or { instanceFactory } to ToLangchainTools to enable execution.',
      );
    }

    resolvingInstance = Promise.resolve(
      options.instanceFactory(options.thisArg),
    ).then((instance) => {
      resolvedInstance = instance;
      return instance;
    });

    return resolvingInstance;
  };

  for (const { name: methodName, method } of methods) {
    const metadata = Reflect.getMetadata(MCP_TOOL_METADATA_KEY, method) as
      | ToolOptions
      | undefined;

    if (!metadata) continue;

    const name = metadata.name ?? methodName;
    if (usedNames.has(name)) {
      throw new Error(
        `Duplicate MCP tool name "${name}" detected on ${Class.name}.`,
      );
    }
    usedNames.add(name);

    const description = metadata.description ?? `${name} tool`;
    const schema = metadata.parameters ?? z.object({});
    const toolMetadata = metadata._meta;
    const toolExtras = metadata.annotations;

    const handler = async <T, R>(input: T, runtime: R) => {
      const instance = await resolveInstance();
      const defaultContext = buildMcpContext({
        name,
        input,
        runtime,
        toolMetadata,
        toolExtras,
        mcpServer: options.mcpServer,
      });
      const context = options.contextFactory
        ? ((await options.contextFactory({
            name,
            input,
            runtime,
            defaultContext,
          })) ?? defaultContext)
        : defaultContext;
      return (method as (data: unknown, context?: unknown) => unknown).call(
        instance,
        input,
        context,
      );
    };

    tools.push(
      tool(handler, {
        name,
        description,
        schema: schema as unknown as z.ZodType,
        metadata: toolMetadata,
        extras: toolExtras,
      }) as StructuredTool,
    );
  }

  if (tools.length === 0) {
    throw new Error(`Class ${Class.name} does not expose any MCP tools.`);
  }

  return tools;
}
