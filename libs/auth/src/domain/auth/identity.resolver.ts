import type { Identity } from './vo/identity';

/**
 * **Who is making THIS request.** Request-scoped, like `AuthService`: an instance belongs to the one
 * request Nest hands it as `REQUEST`, so nothing can ask it about another, and it remembers its
 * answer — a guard, a service and a context function asking in the same request cost a single
 * lookup. A request the global guard already authenticated is answered from what the guard found.
 *
 * Code that holds a request instead of living inside one — a GraphQL context function, a gateway —
 * registers it and resolves this for it:
 *
 * ```ts
 * const contextId = ContextIdFactory.create();
 * moduleRef.registerRequestByContextId(request, contextId);
 * const caller = await moduleRef.resolve(IdentityResolver, contextId, { strict: false });
 * ```
 */
export abstract class IdentityResolver {
  abstract identity(): Promise<Identity | null>;
}
