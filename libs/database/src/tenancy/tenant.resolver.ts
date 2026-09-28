import type { ExecutionContext, Provider, Type } from '@nestjs/common';
import { Injectable } from '@nestjs/common';

import { ROOT_TENANT, TENANT_HEADER, Tenant } from './tenant';

/**
 * **Where the tenant is read from, per transport.**
 *
 * A token rather than an abstract class, because the answer is often one expression and a class to
 * hold it would be ceremony: this accepts a plain function as readily as a provider. What it is NOT
 * is a fixed rule — an HTTP server reads a header, and a service consuming messages reads whatever
 * its transport put the request on, which `@nestposts/transport-eventbus` answers with
 * `IncomingRequest`, a package this one must not depend on.
 */
export const TENANT_RESOLVER = 'TENANT_RESOLVER';

/** A resolver with dependencies — anything Nest can construct. */
export interface TenantResolver {
  tenantOf(context: ExecutionContext): string;
}

/** A resolver without them. The same answer, with nothing to inject. */
export type TenantResolverFn = (context: ExecutionContext) => string;

/** Every shape {@link TenancyModule} accepts: a class, an instance, or a function. */
export type TenantResolverLike =
  | Type<TenantResolver>
  | TenantResolver
  | TenantResolverFn;

type HeaderBag = Record<string, string | string[] | undefined>;

/**
 * The tenant as a header says it: `x-tenant` on HTTP and GraphQL, and the same key on the RPC context
 * for a transport that carries one. A message whose tenant is on the envelope needs the transport's
 * resolver instead — this one answers {@link ROOT_TENANT} for it, which is a wrong answer given
 * quietly, and the reason {@link MessageTenantResolver} exists.
 */
@Injectable()
export class HeaderTenantResolver implements TenantResolver {
  /**
   * The headers of whatever this execution context is looking at, or nothing.
   *
   * Static because it is the one piece anything else might want — `@CurrentTenant()` reads a header
   * with no injector to reach a resolver through.
   */
  static headersOf(context: ExecutionContext): HeaderBag | undefined {
    const type = context.getType<string>();

    if (type === 'http') {
      return context.switchToHttp().getRequest<{ headers?: HeaderBag }>()
        ?.headers;
    }
    if (type === 'graphql') {
      /**
       * The GraphQL context, which is `{ req }` — read positionally rather than through
       * `GqlExecutionContext`, so this package keeps no dependency on `@nestjs/graphql`. It is the
       * same argument that helper unwraps.
       */
      const graphql = context.getArgByIndex<
        { req?: { headers?: HeaderBag } } | undefined
      >(2);
      return graphql?.req?.headers;
    }
    return undefined;
  }

  /** The tenant a header names, for a caller that has a context but no container. */
  static read(context: ExecutionContext): string {
    const fromHeaders =
      HeaderTenantResolver.headersOf(context)?.[TENANT_HEADER];
    if (fromHeaders) {
      return Tenant.normalize(fromHeaders);
    }
    if (context.getType<string>() === 'rpc') {
      const rpc = context.switchToRpc().getContext<HeaderBag | undefined>();
      return Tenant.normalize(rpc?.[TENANT_HEADER]);
    }
    return ROOT_TENANT;
  }

  tenantOf(context: ExecutionContext): string {
    return HeaderTenantResolver.read(context);
  }
}

/**
 * **The tenant of a message, read off the envelope the transport delivered.**
 *
 * Every event between the services here is `@nestjs/outbox`'s `OutboxEnvelope`, and its `headers` are
 * the message's metadata — the tenant among them, under the same `x-tenant` an HTTP request uses. A
 * delivery has no headers of its own, so {@link HeaderTenantResolver} can only shrug at one; this reads
 * the envelope instead, by its shape, so this package still knows nothing of the bus that published
 * it. It runs in an interceptor, before any pipe, which is why it reads the raw payload.
 *
 * Falling back to the header resolver is not a formality: the same service answers HTTP and messages
 * (`apps/posts-api` is a hybrid), and one resolver has to be right for both.
 */
@Injectable()
export class MessageTenantResolver extends HeaderTenantResolver {
  /** The tenant an envelope's headers name, or `undefined` for anything that is not one. */
  static tenantOfEnvelope(data: unknown): string | undefined {
    const envelope = MessageTenantResolver.parsed(data) as
      | { headers?: Record<string, unknown> }
      | undefined;
    const carried = envelope?.headers?.[TENANT_HEADER];
    return typeof carried === 'string' && carried !== ''
      ? Tenant.normalize(carried)
      : undefined;
  }

  override tenantOf(context: ExecutionContext): string {
    if (context.getType<string>() === 'rpc') {
      const carried = MessageTenantResolver.tenantOfEnvelope(
        context.switchToRpc().getData(),
      );
      if (carried) {
        return carried;
      }
    }
    return super.tenantOf(context);
  }

  private static parsed(data: unknown): unknown {
    if (typeof data !== 'string' && !Buffer.isBuffer(data)) {
      return data;
    }
    try {
      return JSON.parse(data.toString());
    } catch {
      return undefined;
    }
  }
}

/**
 * Turns whichever shape was configured into the providers that answer {@link TENANT_RESOLVER}.
 *
 * A class is **registered here**, so a caller passes the class and nothing else: it is constructed by
 * this module's injector and whatever it injects is resolved from there, without anybody providing
 * its dependencies from outside.
 */
export class TenantResolverProviders {
  static for(resolver: TenantResolverLike = HeaderTenantResolver): Provider[] {
    if (TenantResolverProviders.isClass(resolver)) {
      return [resolver, { provide: TENANT_RESOLVER, useExisting: resolver }];
    }
    return [
      {
        provide: TENANT_RESOLVER,
        useValue: TenantResolverProviders.asResolver(resolver),
      },
    ];
  }

  /**
   * A class and a function are both `typeof 'function'`, so the prototype is what tells them apart:
   * a resolver class carries `tenantOf` on it, and a plain function carries nothing.
   */
  private static isClass(
    resolver: TenantResolverLike,
  ): resolver is Type<TenantResolver> {
    return (
      typeof resolver === 'function' &&
      typeof (resolver as Type<TenantResolver>).prototype?.tenantOf ===
        'function'
    );
  }

  private static asResolver(
    resolver: TenantResolver | TenantResolverFn,
  ): TenantResolver {
    return typeof resolver === 'function'
      ? { tenantOf: (context) => resolver(context) }
      : resolver;
  }
}
