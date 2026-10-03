export class McpAppEndpoint {
  static readonly AGENTCORE_HEADER =
    'X-Amzn-Bedrock-AgentCore-Runtime-Custom-Mcp-App';
  static readonly TARGET = 'mcp';

  private constructor(
    readonly url: string,
    readonly headers: Readonly<Record<string, string>>,
  ) {}

  static of(serverUrl: string, app: string): McpAppEndpoint {
    const url = new URL(serverUrl);
    url.searchParams.set('app', app);
    url.searchParams.set('appTarget', McpAppEndpoint.TARGET);
    return new McpAppEndpoint(url.toString(), {
      [McpAppEndpoint.AGENTCORE_HEADER]: app,
    });
  }
}
