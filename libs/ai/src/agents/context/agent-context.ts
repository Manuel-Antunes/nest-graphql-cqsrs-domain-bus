import type { IncomingHttpHeaders } from 'node:http';
import type { Logger } from '@nestjs/common';

export interface AgentContext {
  readonly isAuthenticated: boolean;
  readonly userName: string;
  readonly tenant: string;
  readonly actorId: string;
  readonly credential?: string;
}

export interface AgentRequest {
  readonly headers: IncomingHttpHeaders;
}

export type AgentContextFunction = (
  request: AgentRequest,
) => Promise<AgentContext | undefined>;

export interface AgentAdmissionOptions {
  readonly context?: AgentContextFunction;
  readonly allowAnonymous?: boolean;
}

export class AgentContexts {
  static isAgentContext(value: unknown): value is AgentContext {
    const candidate = value as Partial<AgentContext> | undefined;
    return (
      typeof candidate?.tenant === 'string' &&
      typeof candidate.actorId === 'string' &&
      typeof candidate.userName === 'string'
    );
  }

  static async of(
    options: AgentAdmissionOptions,
    request: AgentRequest,
    logger: Logger,
  ): Promise<AgentContext | undefined> {
    try {
      return (await options.context?.(request)) ?? undefined;
    } catch (error) {
      logger.warn(
        `the caller was refused: ${error instanceof Error ? error.message : String(error)}`,
      );
      return undefined;
    }
  }

  static admits(
    options: AgentAdmissionOptions,
    context: AgentContext | undefined,
  ): boolean {
    return context !== undefined || options.allowAnonymous === true;
  }
}
