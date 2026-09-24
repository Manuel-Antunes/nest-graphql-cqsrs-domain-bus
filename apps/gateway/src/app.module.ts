import { Module } from '@nestjs/common';
import {
  FederationGatewayModule,
  subgraphEventOrigin,
} from '@nestposts/federation-gateway';
import { loggingModule } from '@nestposts/observability';
import { ErrorReportingModule } from '@nestposts/observability/error-reporting.module';
import { useGraphQLErrorReporting } from '@nestposts/observability/graphql-error-reporting';
import { useGraphQLTracing } from '@nestposts/observability/graphql-tracing';

import {
  browserOrigins,
  gatewaySubgraphs,
  gatewayTokenVerifier,
} from './gateway.config';

@Module({
  imports: [
    loggingModule({ serviceName: process.env.OTEL_SERVICE_NAME ?? 'gateway' }),
    ErrorReportingModule.forRoot(),
    FederationGatewayModule.forRoot({
      subgraphs: gatewaySubgraphs(),
      tokenVerifier: gatewayTokenVerifier(),
      cors: { origin: browserOrigins(), credentials: true },
      plugins: [
        useGraphQLTracing({
          resolvers: false,
          originOf: subgraphEventOrigin,
        }),
        useGraphQLErrorReporting(),
      ],
    }),
  ],
})
export class AppModule {}
