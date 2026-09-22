import { type ExecutionContext, Injectable } from '@nestjs/common';
import type { AsyncContext } from '@nestjs/cqrs';
import { HeaderTenantResolver, TENANT_HEADER, Tenant } from '@nestposts/database';
import { type ContextAttributes, TransportRequestContext } from '../request-context';
import { IncomingRequest } from './incoming-request';

/**
 * **The tenant of a message, read off the envelope the transport delivered.**
 *
 * `HeaderTenantResolver` answers for HTTP and GraphQL, and for a message it can only shrug: a
 * delivery has no headers of its own, the tenant is on the envelope's metadata, and decoding that is
 * this package's job rather than `@nestposts/database`'s.
 *
 * It decodes through {@link IncomingRequest} rather than `@TransportRequest()` because an interceptor
 * runs **before** the pipes — the same reason a guard cannot use the parameter decorator either.
 *
 * Falling back to the header resolver is not a formality: the same service answers HTTP and messages
 * (`apps/posts-api` is a hybrid), and one resolver has to be right for both.
 */
@Injectable()
export class TransportTenantResolver extends HeaderTenantResolver {
  constructor(private readonly incoming: IncomingRequest) {
    super();
  }

  /**
   * The tenant a restored request context stands for, whatever class it is.
   *
   * Two shapes answer: the generic {@link TransportRequestContext}, whose `attributes` are the
   * metadata as it arrived, and any application context that implements {@link ContextAttributes} —
   * which is the same method `encode` reads to put it on the wire, so a context that publishes a
   * tenant is a context this can read one from, with nothing to keep in step.
   */
  static tenantCarriedBy(context: AsyncContext | undefined): string | undefined {
    if (!context) {
      return undefined;
    }
    const carried =
      context instanceof TransportRequestContext
        ? context.attributes[TENANT_HEADER]
        : typeof (context as unknown as ContextAttributes).toAttributes === 'function'
          ? (context as unknown as ContextAttributes).toAttributes()[TENANT_HEADER]
          : undefined;

    return carried ? Tenant.normalize(carried) : undefined;
  }

  override tenantOf(context: ExecutionContext): string {
    if (context.getType<string>() === 'rpc') {
      const carried = TransportTenantResolver.tenantCarriedBy(this.incoming.of(context));
      if (carried) {
        return carried;
      }
    }
    return super.tenantOf(context);
  }
}
