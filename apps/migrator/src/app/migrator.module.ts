import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BetterAuthModule } from '@nestposts/auth/infrastructure/better-auth/better-auth.module';
import { DatabaseModule } from '@nestposts/database';
import { NotificationsInfrastructureModule } from '@nestposts/notifications/infrastructure/notifications-infrastructure.module';
import { organizationAuthPluginProviders } from '@nestposts/organizations/infrastructure/better-auth/organization-better-auth.plugin';
import { OrganizationsInfrastructureModule } from '@nestposts/organizations/infrastructure/organizations-infrastructure.module';
import { OrganizationEntities } from '@nestposts/organizations/infrastructure/persistence/organization-entities';
import { PostsInfrastructureModule } from '@nestposts/posts/infrastructure/posts-infrastructure.module';
import { eventLogEntities } from '@nestposts/transport-eventbus/persistence/event-log/event-log.entity';
import { transportEntities } from '@nestposts/transport-eventbus/persistence/message-inbox.entity';
import { UsersInfrastructureModule } from '@nestposts/users/infrastructure/users-infrastructure.module';

import { appConfig } from '../config/app.config';
import { authConfig } from '../config/auth.config';
import type { PostgresConfig } from '../config/postgres.config';
import { postgresConfig } from '../config/postgres.config';
import { seedConfig } from '../config/seed.config';
import { systemConnection } from './connections';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      ignoreEnvFile: true,
      load: [appConfig, authConfig, postgresConfig, seedConfig],
    }),
    DatabaseModule.forRootAsync({
      inject: [postgresConfig.KEY],
      useFactory: (postgres: PostgresConfig) => ({
        ...systemConnection(postgres),
        exclusive: true,
      }),
    }),
    PostsInfrastructureModule,
    UsersInfrastructureModule,
    NotificationsInfrastructureModule,
    BetterAuthModule.forRoot({
      config: authConfig.KEY,
      plugins: organizationAuthPluginProviders,
      entities: OrganizationEntities.withAuth(),
      imports: [OrganizationsInfrastructureModule],
    }),
    DatabaseModule.forFeature([...transportEntities, ...eventLogEntities]),
  ],
})
export class MigratorModule {}
