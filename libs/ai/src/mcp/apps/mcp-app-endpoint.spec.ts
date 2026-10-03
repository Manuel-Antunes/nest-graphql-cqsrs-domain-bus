import { describe, expect, it } from 'vitest';

import { McpAppEndpoint } from './mcp-app-endpoint';

describe('McpAppEndpoint', () => {
  it('names the app in the query, which Apollo MCP Server reads when reached directly', () => {
    expect(McpAppEndpoint.of('http://localhost:8000/mcp', 'posts').url).toBe(
      'http://localhost:8000/mcp?app=posts&appTarget=mcp',
    );
  });

  it('keeps the query AgentCore needs and adds the header it forwards to the container', () => {
    const endpoint = McpAppEndpoint.of(
      'https://bedrock-agentcore.us-east-1.amazonaws.com/runtimes/arn%3Aaws%3Abedrock-agentcore%3Aus-east-1%3A1%3Aruntime%2Fmcp/invocations?qualifier=DEFAULT',
      'posts',
    );

    expect(new URL(endpoint.url).searchParams.get('qualifier')).toBe('DEFAULT');
    expect(new URL(endpoint.url).searchParams.get('app')).toBe('posts');
    expect(endpoint.url).toContain('arn%3Aaws%3Abedrock-agentcore');
    expect(endpoint.headers).toEqual({
      'X-Amzn-Bedrock-AgentCore-Runtime-Custom-Mcp-App': 'posts',
    });
  });
});
