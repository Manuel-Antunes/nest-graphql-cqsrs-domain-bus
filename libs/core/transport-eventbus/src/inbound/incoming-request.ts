import type { ExecutionContext } from '@nestjs/common';
import { Injectable } from '@nestjs/common';
import type { AsyncContext } from '@nestjs/cqrs';
import type { Context } from '@opentelemetry/api';

import { EventMessages } from '../outbound/event-messages';
import { RequestContextCodec } from '../request-context';
import { traceContextOf } from '../tracing';
import { envelopeOf } from './event-reconstruction';

/**
 * **The request a delivery belongs to, for whoever is not a handler's parameter.**
 *
 * A pipe runs **after** the guards and the interceptors — so a guard that wants the tenant, the user
 * or whatever else the request carries cannot take it as a parameter. This is the same decode,
 * reachable from an `ExecutionContext`, which is what a guard, an interceptor and a filter are given:
 *
 * ```ts
 * @Injectable()
 * export class TenantGuard implements CanActivate {
 *   constructor(private readonly incoming: IncomingRequest) {}
 *
 *   canActivate(context: ExecutionContext): boolean {
 *     const request = this.incoming.of(context);
 *     return request instanceof TenantRequest && this.tenants.allows(request.tenantId);
 *   }
 * }
 * ```
 */
@Injectable()
export class IncomingRequest {
  constructor(private readonly codec: RequestContextCodec) {}

  /** From the payload as the transport handed it over: the `OutboxEnvelope`. */
  from(message: unknown): AsyncContext | undefined {
    return this.codec.fromMessage(EventMessages.read(envelopeOf(message)));
  }

  /** From what a guard, an interceptor or a filter is looking at. */
  of(context: ExecutionContext): AsyncContext | undefined {
    return this.from(context.switchToRpc().getData());
  }

  /**
   * **The trace a delivery belongs to**, read off its envelope — or `undefined` for anything that is
   * not a message. The handler's `process` span has ended by the time an interceptor or a filter sees
   * the failure; this is how they still reach the trace of the work that failed
   * (`ErrorReportingModule`'s `traceOf`, in `@nestposts/observability`).
   */
  static traceOf(context: ExecutionContext): Context | undefined {
    if (context.getType() !== 'rpc') {
      return undefined;
    }
    try {
      return traceContextOf(
        envelopeOf(context.switchToRpc().getData()).headers,
      );
    } catch {
      return undefined;
    }
  }
}
