import { YogaDriver } from '@graphql-yoga/nestjs';
import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { ConditionalModule, ConfigModule } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { AuthInfrastructureModule } from '@nestposts/auth/infrastructure/auth-infrastructure.module';
import { DatabaseModule } from '@nestposts/database';
import { loggingModuleAsync } from '@nestposts/observability';
import { ErrorReportingModule } from '@nestposts/observability/error-reporting.module';
import { organizationAuthPluginProviders } from '@nestposts/organizations/infrastructure/better-auth/organization-better-auth.plugin';
import { OrganizationsInfrastructureModule } from '@nestposts/organizations/infrastructure/organizations-infrastructure.module';
import { OrganizationEntities } from '@nestposts/organizations/infrastructure/persistence/organization-entities';
import { RedisCacheOptions, RedisModule } from '@nestposts/redis';

import type { AppConfig } from './config/app.config';
import { appConfig } from './config/app.config';
import type { RedisConfig } from './config/redis.config';
import { redisConfig } from './config/redis.config';
import type { GatewayDriverConfig } from './graphql/gateway-gql-options.factory';
import { GatewayGqlOptionsFactory } from './graphql/gateway-gql-options.factory';
import { GatewayGraphQLModule } from './graphql/gateway-graphql.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      ignoreEnvFile: true,
      load: [appConfig, redisConfig],
    }),
    loggingModuleAsync({
      inject: [appConfig.KEY],
      useFactory: ({ serviceName, logLevel }: AppConfig) => ({
        serviceName,
        level: logLevel,
      }),
    }),
    ErrorReportingModule.forRoot(),
    DatabaseModule.forRoot(),
    ConditionalModule.registerWhen(
      RedisModule.forRootAsync({
        inject: [redisConfig.KEY],
        useFactory: ({ url }: RedisConfig) => ({ url }),
      }),
      () => Boolean(redisConfig().url),
    ),
    CacheModule.registerAsync({ isGlobal: true, useClass: RedisCacheOptions }),
    AuthInfrastructureModule.forRoot({
      routes: false,
      guard: false,
      plugins: organizationAuthPluginProviders,
      entities: OrganizationEntities.withAuth(),
      imports: [OrganizationsInfrastructureModule],
    }),
    GraphQLModule.forRootAsync<GatewayDriverConfig>({
      driver: YogaDriver,
      imports: [GatewayGraphQLModule],
      useClass: GatewayGqlOptionsFactory,
    }),
  ],
})
export class AppModule {}
