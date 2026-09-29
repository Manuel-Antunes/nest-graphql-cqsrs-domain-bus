import type { ExecutionContext } from '@nestjs/common';

/**
 * **The request an `ExecutionContext` is about** — the object the global guard authenticated and
 * wrote the session on: the HTTP request, the GraphQL context's `req` (read positionally, the argument
 * `GqlExecutionContext` unwraps, so nothing here loads `@nestjs/graphql`), or a WebSocket client. A
 * message has none.
 */
export class ExecutionRequest {
  static of(context: ExecutionContext): object | undefined {
    switch (context.getType<string>()) {
      case 'graphql':
        return context.getArgByIndex<{ req?: object } | undefined>(2)?.req;
      case 'ws':
        return context.switchToWs().getClient<object>();
      case 'rpc':
        return undefined;
      default:
        return context.switchToHttp().getRequest<object>();
    }
  }
}
