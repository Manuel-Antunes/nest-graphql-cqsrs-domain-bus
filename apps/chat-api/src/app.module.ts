import { join } from 'node:path';
import type { YogaFederationDriverConfig } from '@graphql-yoga/nestjs-federation';
import { YogaFederationDriver } from '@graphql-yoga/nestjs-federation';
import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { ConditionalModule, ConfigModule } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { GraphQLISODateTime, GraphQLModule } from '@nestjs/graphql';
import { AuthInfrastructureModule } from '@nestposts/auth/infrastructure/auth-infrastructure.module';
import { DatabaseModule, TenancyModule } from '@nestposts/database';
import { loggingModuleAsync } from '@nestposts/observability';
import { ErrorReportingModule } from '@nestposts/observability/error-reporting.module';
import { useGraphQLErrorReporting } from '@nestposts/observability/graphql-error-reporting';
import { useGraphQLTracing } from '@nestposts/observability/graphql-tracing';
import { organizationAuthPluginProviders } from '@nestposts/organizations/infrastructure/better-auth/organization-better-auth.plugin';
import { OrganizationsInfrastructureModule } from '@nestposts/organizations/infrastructure/organizations-infrastructure.module';
import { OrganizationEntities } from '@nestposts/organizations/infrastructure/persistence/organization-entities';
import { TenantMembershipModule } from '@nestposts/organizations/infrastructure/tenancy/tenant-membership.module';
import { RedisCacheOptions, RedisModule } from '@nestposts/redis';

import type { AppConfig } from './config/app.config';
import { appConfig } from './config/app.config';
import { memoryConfig } from './config/memory.config';
import type { RedisConfig } from './config/redis.config';
import { redisConfig } from './config/redis.config';
import { MikroOrmConfiguration } from './infrastructure/persistence/mikro-orm.config';
import { InterfacesModule } from './interfaces/interfaces.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      ignoreEnvFile: true,
      load: [appConfig, memoryConfig, redisConfig],
    }),
    loggingModuleAsync({
      inject: [appConfig.KEY],
      useFactory: ({ serviceName, logLevel }: AppConfig) => ({
        serviceName,
        level: logLevel,
      }),
    }),
    ErrorReportingModule.forRoot(),
    CqrsModule.forRoot(),
    DatabaseModule.forRoot(),
    TenancyModule.forRoot({
      migrations: MikroOrmConfiguration.tenantMigrations(),
    }),
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
      plugins: organizationAuthPluginProviders,
      entities: OrganizationEntities.withAuth(),
      imports: [OrganizationsInfrastructureModule],
    }),
    TenantMembershipModule,
    GraphQLModule.forRoot<YogaFederationDriverConfig>({
      driver: YogaFederationDriver,
      typePaths: [join(__dirname, 'graphql', '**/*.graphql')],
      resolvers: { DateTime: GraphQLISODateTime },
      fieldResolverEnhancers: ['guards', 'interceptors', 'filters'],
      graphiql: true,
      maskedErrors: false,
      plugins: [useGraphQLTracing(), useGraphQLErrorReporting()],
    }),
    InterfacesModule,
  ],
})
export class AppModule {}
