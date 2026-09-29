import 'server-only';

import { CacheModule } from '@nestjs/cache-manager';
import { Module } from '@nestjs/common';
import { ConditionalModule, ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { OutboxModule } from '@nestjs/outbox';
import { StorageModule } from '@nestjs/storage';
import { AttachmentModule } from '@nestposts/asset/infrastructure/attachment.module';
import { AuthInfrastructureModule } from '@nestposts/auth/infrastructure/auth-infrastructure.module';
import { BillingInfrastructureModule } from '@nestposts/billing/infrastructure/billing-infrastructure.module';
import { CqsrsModule } from '@nestposts/cqsrs';
import { DatabaseModule, TenancyModule } from '@nestposts/database';
import { tenantMigrations } from '@nestposts/migrator/migrations/tenant/index';
import { PublishingOnDemandNotifications } from '@nestposts/notifications/infrastructure/on-demand/publishing-on-demand-notifications';
import { organizationAuthPluginProviders } from '@nestposts/organizations/infrastructure/better-auth/organization-better-auth.plugin';
import { OrganizationsInfrastructureModule } from '@nestposts/organizations/infrastructure/organizations-infrastructure.module';
import { OrganizationEntities } from '@nestposts/organizations/infrastructure/persistence/organization-entities';
import {
  MikroOrmOutboxModule,
  MikroOrmTransactionManager,
} from '@nestposts/outbox-mikro-orm';
import { RedisCacheOptions, RedisModule } from '@nestposts/redis';
import {
  TRANSPORT_EVENT_BUS_PUBLISHER,
  TransportEventBusModule,
  TransportIdentity,
} from '@nestposts/transport-eventbus';

import type { AppConfig } from './config/app.config';
import { appConfig } from './config/app.config';
import { awsConfig } from './config/aws.config';
import { inngestConfig } from './config/inngest.config';
import type { OutboxConfig } from './config/outbox.config';
import { outboxConfig } from './config/outbox.config';
import { rabbitmqConfig } from './config/rabbitmq.config';
import type { RedisConfig } from './config/redis.config';
import { redisConfig } from './config/redis.config';
import { storageConfig } from './config/storage.config';
import { NextCookiesBetterAuthPluginProvider } from './next-cookies.plugin';
import { BucketDisks } from './storage/bucket-disks';
import { WebEventsClient } from './web-events.client';
import { WebEventsClientModule } from './web-events-client.module';

/**
 * **The Next server's Nest application** — a container, not a server.
 *
 * It exists so this application wires Better Auth **the same way `apps/posts-api` does**, through the
 * same modules, instead of a second assembly that has to be kept in step. What it leaves out is the
 * HTTP surface: `AuthInfrastructureModule` comes with `routes: false` and `guard: false` — no
 * `/api/auth/*` catch-all and no global guard, which need an adapter this context does not have —
 * and keeps what `@thallesp/nestjs-better-auth` does besides: attaching every `@DatabaseHook`
 * provider to the instance. Next serves the routes itself.
 *
 * Its `AUTH_URL` is this origin — the default under `next dev`, which sets `PORT` — because the session
 * cookie has to belong to the origin the browser is talking to. The SECRET and the database are the
 * posts-api's, which is what makes the cookie this writes one that the posts-api resolves.
 *
 * An organization created here is a tenant created here: `TenancyModule` is what the organization
 * plugin's hook migrates the new tenant's schema with, from the migrations the migrator lists.
 *
 * It PUBLISHES, too, and only that: the emails Better Auth asks for — a verification link, a reset,
 * a one-time code — are notifications, and they leave through the transport for `apps/notificator`
 * to deliver. No inbox and no event log, because nothing arrives here.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      ignoreEnvFile: true,
      load: [
        appConfig,
        awsConfig,
        inngestConfig,
        outboxConfig,
        rabbitmqConfig,
        redisConfig,
        storageConfig,
      ],
    }),
    ConditionalModule.registerWhen(
      RedisModule.forRootAsync({
        inject: [redisConfig.KEY],
        useFactory: ({ url }: RedisConfig) => ({ url }),
      }),
      () => Boolean(redisConfig().url),
    ),
    CacheModule.registerAsync({ isGlobal: true, useClass: RedisCacheOptions }),
    EventEmitterModule.forRoot(),
    CqsrsModule.forRoot({ aggregatePublisher: TRANSPORT_EVENT_BUS_PUBLISHER }),
    DatabaseModule.forRoot(),
    TenancyModule.forRoot({
      http: false,
      migrations: { migrationsList: tenantMigrations },
    }),
    StorageModule.forRootAsync({ useClass: BucketDisks }),
    AttachmentModule.forRoot({}),
    OutboxModule.forRootAsync({
      imports: [WebEventsClientModule],
      transports: WebEventsClient.destinations(appConfig()),
      inject: [appConfig.KEY, outboxConfig.KEY],
      useFactory: (app: AppConfig, { relay, retry }: OutboxConfig) => ({
        route: WebEventsClient.route(app),
        relay: { enabled: relay === 'poll' },
        retry,
      }),
    }),
    MikroOrmOutboxModule.forRootAsync({
      inject: [appConfig.KEY],
      useFactory: ({ name }: AppConfig) => ({ producer: name }),
    }),
    TransportEventBusModule.forRootAsync({
      inject: [appConfig.KEY],
      useFactory: ({ name, publishes }: AppConfig) =>
        TransportIdentity.named(name, { publishes }),
      transactionManager: MikroOrmTransactionManager,
      outbox: {
        destinations: WebEventsClient.namespaces,
        inject: [appConfig.KEY, outboxConfig.KEY],
        useFactory: (app: AppConfig, { relay }: OutboxConfig) => ({
          relay,
          route: WebEventsClient.route(app),
        }),
      },
    }),
    AuthInfrastructureModule.forRoot({
      routes: false,
      guard: false,
      plugins: [
        ...organizationAuthPluginProviders,
        ...BillingInfrastructureModule.authPlugins(),
      ],
      trailingPlugins: [NextCookiesBetterAuthPluginProvider],
      entities: OrganizationEntities.withAuth(),
      imports: [OrganizationsInfrastructureModule, BillingInfrastructureModule],
      notifications: PublishingOnDemandNotifications,
    }),
    OrganizationsInfrastructureModule,
  ],
})
export class WebAppModule {}
