'use client';

import { useMemo } from 'react';
import {
  type MCPAppsActivityContent,
  MCPAppsActivityRenderer,
  MCPAppsActivityType,
  useAgent,
} from '@copilotkit/react-core/v2';

import { THEO_AGENT_ID } from '../_components/theo-agent-id';

export interface McpAppFrameProps {
  server: string;
  resourceUri: string;
  toolName: string;
  toolInput?: Record<string, unknown>;
  toolResult?: Record<string, unknown>;
  title?: string;
}

export class McpAppContent {
  static of(props: McpAppFrameProps): MCPAppsActivityContent {
    return {
      resourceUri: props.resourceUri,
      serverId: props.server,
      serverHash: props.server,
      toolInput: props.toolInput ?? {},
      result: {
        content: [],
        ...(props.toolResult ?? {}),
      } as MCPAppsActivityContent['result'],
    };
  }
}

export function McpAppFrame(props: McpAppFrameProps) {
  const { agent } = useAgent({ agentId: THEO_AGENT_ID });
  const signature = JSON.stringify(props);
  const content = useMemo(
    () => McpAppContent.of(JSON.parse(signature) as McpAppFrameProps),
    [signature],
  );

  return (
    <section
      aria-label={props.title ?? `${props.toolName} app`}
      data-mcp-app={props.toolName}
      className="w-full overflow-hidden rounded-xl border bg-card"
    >
      <MCPAppsActivityRenderer
        activityType={MCPAppsActivityType}
        content={content}
        message={undefined}
        agent={agent}
      />
    </section>
  );
}
