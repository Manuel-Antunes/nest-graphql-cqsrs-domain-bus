import { Module } from '@nestjs/common';
import {
  FederationGatewayModule,
  subgraphEventOrigin,
} from '@nestposts/federation-gateway';
import { loggingModule } from '@nestposts/observability';
import { useGraphQLTracing } from '@nestposts/observability/graphql-tracing';

import {
  browserOrigins,
  gatewaySubgraphs,
  gatewayTokenVerifier,
} from './gateway.config';

@Module({
  imports: [
    loggingModule({ serviceName: process.env.OTEL_SERVICE_NAME ?? 'gateway' }),
    FederationGatewayModule.forRoot({
      subgraphs: gatewaySubgraphs(),
      tokenVerifier: gatewayTokenVerifier(),
      cors: { origin: browserOrigins(), credentials: true },
      plugins: [
        useGraphQLTracing({
          resolvers: false,
          originOf: subgraphEventOrigin,
        }),
      ],
    }),
  ],
})
export class AppModule {}
