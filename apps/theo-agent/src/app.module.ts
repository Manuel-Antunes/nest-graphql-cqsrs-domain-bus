import { Module } from '@nestjs/common';
import { ConditionalModule, ConfigModule } from '@nestjs/config';
import { AgentCoreAgUiModule } from '@nestposts/ai/ag-ui/agentcore/agentcore-ag-ui.module';
import { AgUiModule } from '@nestposts/ai/ag-ui/server/ag-ui.module';
import { PlatformCallers } from '@nestposts/ai/agents/callers/platform-callers';
import { PlatformCallersModule } from '@nestposts/ai/agents/callers/platform-callers.module';
import { AuthInfrastructureModule } from '@nestposts/auth/infrastructure/auth-infrastructure.module';
import { DatabaseModule } from '@nestposts/database';
import { loggingModuleAsync } from '@nestposts/observability';
import { organizationAuthPluginProviders } from '@nestposts/organizations/infrastructure/better-auth/organization-better-auth.plugin';
import { OrganizationsInfrastructureModule } from '@nestposts/organizations/infrastructure/organizations-infrastructure.module';
import { OrganizationEntities } from '@nestposts/organizations/infrastructure/persistence/organization-entities';
import { RedisModule } from '@nestposts/redis';

import { TheoAgent } from './agent/theo.agent';
import { TheoModule } from './agent/theo.module';
import { agentsConfig } from './config/agents.config';
import type { AppConfig } from './config/app.config';
import { appConfig } from './config/app.config';
import { bedrockConfig } from './config/bedrock.config';
import type { RedisConfig } from './config/redis.config';
import { redisConfig } from './config/redis.config';
import { webSearchConfig } from './config/web-search.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      ignoreEnvFile: true,
      load: [
        appConfig,
        bedrockConfig,
        agentsConfig,
        redisConfig,
        webSearchConfig,
      ],
    }),
    loggingModuleAsync({
      inject: [appConfig.KEY],
      useFactory: ({ serviceName, logLevel }: AppConfig) => ({
        serviceName,
        level: logLevel,
      }),
    }),
    DatabaseModule.forRoot(),
    ConditionalModule.registerWhen(
      RedisModule.forRootAsync({
        inject: [redisConfig.KEY],
        useFactory: ({ url }: RedisConfig) => ({ url }),
      }),
      () => Boolean(redisConfig().url),
    ),
    AuthInfrastructureModule.forRoot({
      routes: false,
      guard: false,
      plugins: organizationAuthPluginProviders,
      entities: OrganizationEntities.withAuth(),
      imports: [OrganizationsInfrastructureModule],
    }),
    TheoModule,
    AgentCoreAgUiModule.registerAsync({
      imports: [
        AgUiModule.registerAsync({
          imports: [PlatformCallersModule, TheoModule],
          inject: [PlatformCallers],
          useFactory: (callers: PlatformCallers) => ({
            agentProviders: [TheoAgent],
            resolveUser: (headers) => callers.resolve(headers),
          }),
        }),
      ],
      inject: [appConfig.KEY],
      useFactory: ({ port, host }: AppConfig) => ({
        agent: TheoAgent,
        port,
        host,
      }),
    }),
  ],
})
export class AppModule {}
