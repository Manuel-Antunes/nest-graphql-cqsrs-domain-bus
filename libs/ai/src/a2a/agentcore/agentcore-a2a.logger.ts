import { Logger } from '@nestjs/common';
import type { A2ALogger } from 'bedrock-agentcore/runtime/a2a';

export class AgentCoreA2aLogger implements A2ALogger {
  constructor(private readonly logger = new Logger('AgentCoreA2a')) {}

  fatal(...args: unknown[]): void {
    this.logger.fatal(AgentCoreA2aLogger.line(args));
  }

  error(...args: unknown[]): void {
    this.logger.error(AgentCoreA2aLogger.line(args));
  }

  warn(...args: unknown[]): void {
    this.logger.warn(AgentCoreA2aLogger.line(args));
  }

  info(...args: unknown[]): void {
    this.logger.log(AgentCoreA2aLogger.line(args));
  }

  debug(...args: unknown[]): void {
    this.logger.debug(AgentCoreA2aLogger.line(args));
  }

  trace(...args: unknown[]): void {
    this.logger.verbose(AgentCoreA2aLogger.line(args));
  }

  child(): A2ALogger {
    return this;
  }

  private static line(args: readonly unknown[]): string {
    return args
      .map((arg) =>
        typeof arg === 'string'
          ? arg
          : arg instanceof Error
            ? (arg.stack ?? arg.message)
            : JSON.stringify(arg),
      )
      .join(' ');
  }
}
