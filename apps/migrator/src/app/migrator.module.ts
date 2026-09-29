import { Module } from '@nestjs/common';
import { ConditionalModule, ConfigModule } from '@nestjs/config';
import { AuthInfrastructureModule } from '@nestposts/auth/infrastructure/auth-infrastructure.module';
import { DatabaseModule } from '@nestposts/database';
import { eventStoreEntities } from '@nestposts/event-store-mikro-orm/event-store.entities';
import { NotificationsInfrastructureModule } from '@nestposts/notifications/infrastructure/notifications-infrastructure.module';
import { organizationAuthPluginProviders } from '@nestposts/organizations/infrastructure/better-auth/organization-better-auth.plugin';
import { OrganizationsInfrastructureModule } from '@nestposts/organizations/infrastructure/organizations-infrastructure.module';
import { OrganizationEntities } from '@nestposts/organizations/infrastructure/persistence/organization-entities';
import { outboxEntities } from '@nestposts/outbox-mikro-orm/outbox.entities';
import { PostsInfrastructureModule } from '@nestposts/posts/infrastructure/posts-infrastructure.module';
import { RedisModule } from '@nestposts/redis';
import { UsersInfrastructureModule } from '@nestposts/users/infrastructure/users-infrastructure.module';

import { appConfig } from '../config/app.config';
import { outboxConfig } from '../config/outbox.config';
import type { RedisConfig } from '../config/redis.config';
import { redisConfig } from '../config/redis.config';
import { seedConfig } from '../config/seed.config';
import { systemConnection } from './connections';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      ignoreEnvFile: true,
      load: [appConfig, outboxConfig, redisConfig, seedConfig],
    }),
    DatabaseModule.forRoot({ ...systemConnection(), exclusive: true }),
    ConditionalModule.registerWhen(
      RedisModule.forRootAsync({
        inject: [redisConfig.KEY],
        useFactory: ({ url }: RedisConfig) => ({ url }),
      }),
      () => Boolean(redisConfig().url),
    ),
    PostsInfrastructureModule,
    UsersInfrastructureModule,
    NotificationsInfrastructureModule,
    AuthInfrastructureModule.forRoot({
      routes: false,
      guard: false,
      plugins: organizationAuthPluginProviders,
      entities: OrganizationEntities.withAuth(),
      imports: [OrganizationsInfrastructureModule],
    }),
    DatabaseModule.forFeature([...outboxEntities, ...eventStoreEntities]),
  ],
})
export class MigratorModule {}
