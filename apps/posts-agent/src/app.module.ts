import { Module } from '@nestjs/common';
import { ConditionalModule, ConfigModule } from '@nestjs/config';
import { AgentCoreA2aModule } from '@nestposts/ai/a2a/agentcore/agentcore-a2a.module';
import { AuthInfrastructureModule } from '@nestposts/auth/infrastructure/auth-infrastructure.module';
import { DatabaseModule } from '@nestposts/database';
import { loggingModuleAsync } from '@nestposts/observability';
import { organizationAuthPluginProviders } from '@nestposts/organizations/infrastructure/better-auth/organization-better-auth.plugin';
import { OrganizationsInfrastructureModule } from '@nestposts/organizations/infrastructure/organizations-infrastructure.module';
import { OrganizationEntities } from '@nestposts/organizations/infrastructure/persistence/organization-entities';
import { RedisModule } from '@nestposts/redis';

import { postsAgentA2a } from './agent/posts-agent.a2a';
import { PostsManagerAgent } from './agent/posts-manager.agent';
import { PostsManagerModule } from './agent/posts-manager.module';
import type { AppConfig } from './config/app.config';
import { appConfig } from './config/app.config';
import { bedrockConfig } from './config/bedrock.config';
import { mcpConfig } from './config/mcp.config';
import { memoryConfig } from './config/memory.config';
import { oauthConfig } from './config/oauth.config';
import type { RedisConfig } from './config/redis.config';
import { redisConfig } from './config/redis.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      ignoreEnvFile: true,
      load: [
        appConfig,
        bedrockConfig,
        mcpConfig,
        oauthConfig,
        memoryConfig,
        redisConfig,
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
    PostsManagerModule,
    AgentCoreA2aModule.registerAsync({
      imports: [postsAgentA2a],
      inject: [appConfig.KEY],
      useFactory: ({ port, host, url }: AppConfig) => ({
        agent: PostsManagerAgent,
        port,
        host,
        url,
      }),
    }),
  ],
})
export class AppModule {}
