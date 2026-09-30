'use client';

import type { RefObject } from 'react';
import { useEffect } from 'react';
import type { WebMcpInputSchema } from '@nestposts/ui/components/web-mcp';
import { getModelContext } from '@nestposts/ui/components/web-mcp';

interface FramedTool {
  name: string;
  title?: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}

interface ToolResult {
  content: { type: 'text'; text: string }[];
  isError: true;
}

const failure = (text: string): ToolResult => ({
  content: [{ type: 'text', text }],
  isError: true,
});

const EMPTY_SCHEMA = { type: 'object', properties: {} };

export function useChatwootTools(
  frame: RefObject<HTMLIFrameElement | null>,
  origin: string,
) {
  useEffect(() => {
    const context = getModelContext();
    if (!context) return;

    const registrations = new Map<string, AbortController>();
    const pending = new Map<string, (result: unknown) => void>();

    const unregisterAll = () => {
      for (const registration of registrations.values()) registration.abort();
      registrations.clear();
    };

    const execute = (tool: FramedTool) => (args: Record<string, unknown>) =>
      new Promise<unknown>((resolve) => {
        const target = frame.current?.contentWindow;
        if (!target) {
          resolve(failure('Chatwoot is not open'));
          return;
        }
        const requestId = `${tool.name}-${crypto.randomUUID()}`;
        pending.set(requestId, resolve);
        target.postMessage(
          { type: 'WEBMCP_EXECUTE_TOOL', requestId, name: tool.name, args },
          origin,
        );
      });

    const register = (tools: FramedTool[]) => {
      unregisterAll();
      for (const tool of tools) {
        const registration = new AbortController();
        registrations.set(tool.name, registration);
        context
          .registerTool(
            {
              name: tool.name,
              ...(tool.title ? { title: tool.title } : {}),
              description: tool.description,
              inputSchema: (tool.inputSchema ??
                EMPTY_SCHEMA) as WebMcpInputSchema,
              annotations: { ...tool.annotations, untrustedContentHint: true },
              execute: execute(tool),
            },
            { signal: registration.signal },
          )
          .catch((error: unknown) => {
            console.warn('Chatwoot tool not registered:', tool.name, error);
            registrations.delete(tool.name);
          });
      }
    };

    const onMessage = (event: MessageEvent) => {
      if (
        event.origin !== origin ||
        event.source !== frame.current?.contentWindow
      ) {
        return;
      }
      const message = event.data as Record<string, unknown> | null;
      if (message?.type === 'WEBMCP_TOOLS_UPDATE') {
        register((message.tools as FramedTool[] | undefined) ?? []);
      }
      if (message?.type === 'WEBMCP_TOOL_RESULT') {
        const requestId = message.requestId as string;
        const resolve = pending.get(requestId);
        pending.delete(requestId);
        resolve?.(
          message.error
            ? failure(`Error: ${String(message.error)}`)
            : message.result,
        );
      }
    };

    window.addEventListener('message', onMessage);
    frame.current?.contentWindow?.postMessage(
      { type: 'WEBMCP_REQUEST_TOOLS' },
      origin,
    );

    return () => {
      window.removeEventListener('message', onMessage);
      unregisterAll();
      for (const resolve of pending.values()) {
        resolve(failure('Chatwoot was closed'));
      }
      pending.clear();
    };
  }, [frame, origin]);
}
