import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import {
  FederationGatewayModule,
  JwksGatewayTokenVerifier,
  subgraphEventOrigin,
} from '@nestposts/federation-gateway';
import { loggingModuleAsync } from '@nestposts/observability';
import { ErrorReportingModule } from '@nestposts/observability/error-reporting.module';
import { useGraphQLErrorReporting } from '@nestposts/observability/graphql-error-reporting';
import { useGraphQLTracing } from '@nestposts/observability/graphql-tracing';

import type { AppConfig } from './config/app.config';
import { appConfig } from './config/app.config';
import type { AuthConfig } from './config/auth.config';
import { authConfig } from './config/auth.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      ignoreEnvFile: true,
      load: [appConfig, authConfig],
    }),
    loggingModuleAsync({
      inject: [appConfig.KEY],
      useFactory: ({ serviceName, logLevel }: AppConfig) => ({
        serviceName,
        level: logLevel,
      }),
    }),
    ErrorReportingModule.forRoot(),
    FederationGatewayModule.forRootAsync({
      inject: [appConfig.KEY, authConfig.KEY],
      useFactory: (app: AppConfig, auth: AuthConfig) => ({
        subgraphs: app.subgraphs,
        tokenVerifier: new JwksGatewayTokenVerifier({
          jwksUrl: auth.jwksUrl,
          issuer: auth.issuer,
          audience: app.url,
        }),
        cors: { origin: app.corsOrigins, credentials: true },
        plugins: [
          useGraphQLTracing({
            resolvers: false,
            originOf: subgraphEventOrigin,
          }),
          useGraphQLErrorReporting(),
        ],
      }),
    }),
  ],
})
export class AppModule {}
