import type {
  CallToolResult,
  ExecuteToolOptions,
  GetToolsOptions,
  ModelContextAPI,
  RegisteredTool,
} from './types';

export function getModelContext(): ModelContextAPI | null {
  if (typeof document === 'undefined') return null;
  return document.modelContext ?? null;
}

export interface DiscoveredTool extends Omit<RegisteredTool, 'inputSchema'> {
  inputSchema: Record<string, unknown>;
}

export function parseToolSchema(
  schema: RegisteredTool['inputSchema'],
): Record<string, unknown> {
  if (!schema) return { type: 'object', properties: {} };
  if (typeof schema !== 'string') return schema;
  try {
    const parsed = JSON.parse(schema) as unknown;
    if (parsed && typeof parsed === 'object') {
      return parsed as Record<string, unknown>;
    }
  } catch {}
  return { type: 'object', properties: {} };
}

export async function listWebMcpTools(
  options?: GetToolsOptions,
): Promise<DiscoveredTool[]> {
  const mc = getModelContext();
  if (!mc) return [];
  const tools = await mc.getTools(options);
  return tools.map((tool) => ({
    ...tool,
    inputSchema: parseToolSchema(tool.inputSchema),
  }));
}

export async function findWebMcpTool(
  name: string,
  options?: GetToolsOptions,
): Promise<RegisteredTool | null> {
  const mc = getModelContext();
  if (!mc) return null;
  const tools = await mc.getTools(options);
  return tools.find((tool) => tool.name === name) ?? null;
}

export async function callWebMcpTool(
  tool: RegisteredTool,
  args: Record<string, unknown> | string = {},
  options?: ExecuteToolOptions,
): Promise<string> {
  const mc = getModelContext();
  if (!mc) {
    throw new Error('WebMCP is not available in this browser');
  }
  const payload = typeof args === 'string' ? args : JSON.stringify(args ?? {});
  return mc.executeTool(tool, payload, options);
}

export async function callWebMcpToolByName(
  name: string,
  args: Record<string, unknown> = {},
  options?: ExecuteToolOptions & GetToolsOptions,
): Promise<CallToolResult> {
  const tool = await findWebMcpTool(name, {
    fromOrigins: options?.fromOrigins,
  });
  if (!tool) {
    return {
      content: [
        { type: 'text', text: `No tool named "${name}" is registered` },
      ],
      isError: true,
    };
  }
  try {
    const raw = await callWebMcpTool(tool, args, { signal: options?.signal });
    return decodeToolResult(raw);
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: `Tool "${name}" failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      ],
      isError: true,
    };
  }
}

export function decodeToolResult(raw: string): CallToolResult {
  if (raw === 'undefined' || raw === '') {
    return { content: [] };
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      Array.isArray((parsed as CallToolResult).content)
    ) {
      return parsed as CallToolResult;
    }
    return {
      content: [{ type: 'text', text: JSON.stringify(parsed) }],
    };
  } catch {
    return { content: [{ type: 'text', text: raw }] };
  }
}

export function onWebMcpToolsChanged(callback: () => void): () => void {
  const mc = getModelContext();
  if (!mc) return () => undefined;
  mc.addEventListener('toolchange', callback);
  return () => mc.removeEventListener('toolchange', callback);
}
