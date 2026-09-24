import type { YogaDriverConfig } from '@graphql-yoga/nestjs';

import type {
  GatewayTokenVerifier,
  SubgraphTokenResolver,
} from './auth/gateway-identity';
import type { SubgraphSource } from './composition/subgraph-source';

export const FEDERATION_GATEWAY_OPTIONS = Symbol('FEDERATION_GATEWAY_OPTIONS');

export interface FederationGatewayOptions {
  /** The subgraphs to compose and route to. */
  readonly subgraphs: readonly SubgraphSource[];
  /** Verifies the inbound bearer once per request; without one, tokens are only forwarded. */
  readonly tokenVerifier?: GatewayTokenVerifier;
  /** Per-subgraph credential translation; see {@link SubgraphTokenResolver}. */
  readonly subgraphTokenResolvers?: readonly SubgraphTokenResolver[];
  /** Replaces the default forwarded headers (`cookie`, `authorization`, `x-tenant`). */
  readonly forwardedHeaders?: readonly string[];
  /** Where the gateway answers; `/graphql` by default. */
  readonly path?: string;
  /** Passed to Yoga as is — the browser calls the gateway cross-origin, with credentials. */
  readonly cors?: YogaDriverConfig['cors'];
  /** GraphiQL on the gateway's path; on by default. */
  readonly graphiql?: boolean;
  /**
   * Yoga plugins for the gateway's own server — tracing, typically, with `subgraphEventOrigin` as
   * where a subscription event came from.
   */
  readonly plugins?: YogaDriverConfig['plugins'];
}
