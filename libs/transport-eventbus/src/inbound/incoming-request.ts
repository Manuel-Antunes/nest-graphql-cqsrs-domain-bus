import { type ExecutionContext, Injectable } from '@nestjs/common';
import type { AsyncContext } from '@nestjs/cqrs';
import { RequestContextCodec } from '../request-context';
import { envelopeFrom } from './event-reconstruction';

/**
 * **The request a delivery belongs to, for whoever is not a handler's parameter.**
 *
 * `@TransportRequest()` is a pipe, and a pipe runs **after** the guards and the interceptors — so a
 * guard that wants the tenant, the user or whatever else the request carries cannot use it. This is
 * the same decode, reachable from an `ExecutionContext`, which is what a guard, an interceptor and a
 * filter are given:
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
 *
 * ## Why this matters more than it looks
 * Because it is what makes the framework's own machinery work on a message: everything the publishing
 * service put in the context — authentication, a tenant id, a feature flag, a locale — is on the
 * envelope's metadata, and from here a **shared guard** reads it the way it reads an HTTP request.
 * Without it, a service that consumes messages has to write a parallel authorisation path for them.
 */
@Injectable()
export class IncomingRequest {
  constructor(private readonly codec: RequestContextCodec) {}

  /** From the payload as the transport handed it over — an {@link EventEnvelope}, or what it was read from. */
  from(message: unknown): AsyncContext | undefined {
    return this.codec.decode(envelopeFrom(message));
  }

  /** From what a guard, an interceptor or a filter is looking at. */
  of(context: ExecutionContext): AsyncContext | undefined {
    return this.from(context.switchToRpc().getData());
  }
}
