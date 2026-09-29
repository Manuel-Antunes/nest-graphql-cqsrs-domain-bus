import type { YogaDriverServerContext } from '@graphql-yoga/nestjs';
import type { Identity } from '@nestposts/auth/domain/auth/vo/identity';
import type { YogaInitialContext } from 'graphql-yoga';

import type { SubgraphCallContext } from '../supergraph/federated-schema';

export type GatewayServerContext = YogaInitialContext &
  YogaDriverServerContext<'fastify'>;

export interface GatewayContext extends SubgraphCallContext {
  readonly identity: Identity | null;
  readonly subgraphHeaders: Readonly<Record<string, string>>;
}
