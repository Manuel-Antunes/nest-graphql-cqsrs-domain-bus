/** Who the inbound bearer says the caller is, once the gateway has verified it. */
export interface GatewayIdentity {
  /** The token's subject (`sub`) — the user it was issued for. */
  readonly subject?: string;
  /** The OAuth client it was issued to (`azp`, or `client_id`). */
  readonly clientId?: string;
  /** The scopes it was granted. */
  readonly scopes: readonly string[];
  /** The organization the token is bound to, when its issuer put one in it. */
  readonly organizationId?: string;
  /** The same organization's slug — what the gateway forwards as `x-tenant` when no header names one. */
  readonly organizationSlug?: string;
}

/**
 * Verifies the inbound `Authorization` header, **once per request**, into a {@link GatewayIdentity}.
 * Answers `null` for a missing, foreign or invalid token: the gateway still forwards the header, and
 * each subgraph decides for itself whether it is enough.
 */
export abstract class GatewayTokenVerifier {
  abstract verify(
    authorization: string | undefined,
  ): Promise<GatewayIdentity | null>;
}

/** A verifier for a gateway that derives nothing from tokens and forwards them as they came. */
export class ForwardingGatewayTokenVerifier extends GatewayTokenVerifier {
  async verify(): Promise<GatewayIdentity | null> {
    return null;
  }
}

/** A header to put on one subgraph's request, in place of the forwarded `Authorization`. */
export interface SubgraphAuthHeader {
  readonly name: string;
  readonly value: string;
}

/**
 * Translates the caller's identity into ONE subgraph's native credential — for a subgraph that does
 * not trust the identity provider's tokens itself. Answering `null` forwards the inbound
 * `Authorization` untouched, so the subgraph authenticates the caller on its own.
 */
export interface SubgraphTokenResolver {
  /** The subgraph this resolver speaks for, by name. */
  readonly subgraph: string;
  resolve(identity: GatewayIdentity | null): Promise<SubgraphAuthHeader | null>;
}
