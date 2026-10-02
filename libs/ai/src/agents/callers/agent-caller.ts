export interface AgentCaller {
  readonly isAuthenticated: boolean;
  readonly userName: string;
}

export type AgentCallerHeaders = Record<string, string | string[] | undefined>;

export type AgentCallerResolver = (
  headers: AgentCallerHeaders,
) => Promise<AgentCaller | undefined>;
