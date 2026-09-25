import 'server-only';

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BetterAuthModule } from '@nestposts/auth/infrastructure/better-auth/better-auth.module';
import { BillingInfrastructureModule } from '@nestposts/billing/infrastructure/billing-infrastructure.module';
import { CqsrsModule } from '@nestposts/cqsrs';
import {
  DatabaseModule,
  postgresDatabase,
  SYSTEM_SCHEMA,
  TenancyModule,
} from '@nestposts/database';
import { tenantMigrations } from '@nestposts/migrator/migrations/tenant/index';
import { PublishingOnDemandNotifications } from '@nestposts/notifications/infrastructure/on-demand/publishing-on-demand-notifications';
import { organizationAuthPluginProviders } from '@nestposts/organizations/infrastructure/better-auth/organization-better-auth.plugin';
import { OrganizationsInfrastructureModule } from '@nestposts/organizations/infrastructure/organizations-infrastructure.module';
import { OrganizationEntities } from '@nestposts/organizations/infrastructure/persistence/organization-entities';
import {
  TRANSPORT_EVENT_BUS_PUBLISHER,
  TransportEventBusModule,
  TransportIdentity,
} from '@nestposts/transport-eventbus';
import { Inngest } from 'inngest';

import { SubscriptionAuthorship } from './billing/subscription-authorship';
import { SubscriptionEmails } from './billing/subscription-emails';
import type { AppConfig } from './config/app.config';
import { appConfig } from './config/app.config';
import { authConfig } from './config/auth.config';
import { awsConfig } from './config/aws.config';
import { billingConfig } from './config/billing.config';
import type { InngestConfig } from './config/inngest.config';
import { inngestConfig } from './config/inngest.config';
import type { PostgresConfig } from './config/postgres.config';
import { postgresConfig } from './config/postgres.config';
import { rabbitmqConfig } from './config/rabbitmq.config';
import { NextCookiesBetterAuthPluginProvider } from './next-cookies.plugin';
import { NotificationsPublisher } from './notifications.publisher';
import { WebEventsClient } from './web-events.client';

const billing = billingConfig().polar;

/**
 * **The Next server's Nest application** — a container, not a server.
 *
 * It exists so this application wires Better Auth **the same way `apps/posts-api` does**, through the
 * same modules, instead of a second assembly that has to be kept in step. What it leaves out is the
 * HTTP surface: `AuthInfrastructureModule` installs the `/api/auth/*` catch-all and the global guard
 * through `@thallesp/nestjs-better-auth`, which needs an adapter this context does not have — so it
 * imports `BetterAuthModule` directly, which is exactly the providers and nothing else. Next serves
 * the routes itself.
 *
 * `baseUrl` is overridden to this origin: the session cookie has to belong to the origin the browser
 * is talking to. The SECRET and the database are the posts-api's, which is what makes the cookie this
 * writes one that the posts-api resolves.
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
        authConfig,
        awsConfig,
        billingConfig,
        inngestConfig,
        postgresConfig,
        rabbitmqConfig,
      ],
    }),
    CqsrsModule.forRoot({ aggregatePublisher: TRANSPORT_EVENT_BUS_PUBLISHER }),
    DatabaseModule.forRootAsync({
      inject: [postgresConfig.KEY],
      useFactory: ({ url, debug }: PostgresConfig) =>
        postgresDatabase(SYSTEM_SCHEMA, { clientUrl: url, debug }),
    }),
    TenancyModule.forRoot({
      http: false,
      migrations: { migrationsList: tenantMigrations },
    }),
    TransportEventBusModule.forRootAsync({
      inject: [appConfig.KEY],
      useFactory: ({ name, publishes }: AppConfig) =>
        TransportIdentity.named(name, { publishes }),
    }),
    BetterAuthModule.forRoot({
      plugins: [
        ...organizationAuthPluginProviders,
        ...BillingInfrastructureModule.authPlugins(billing),
      ],
      trailingPlugins: [NextCookiesBetterAuthPluginProvider],
      entities: OrganizationEntities.withAuth(),
      imports: [
        OrganizationsInfrastructureModule,
        BillingInfrastructureModule.forRoot(billing, {
          listeners: [SubscriptionEmails, SubscriptionAuthorship],
        }),
      ],
      config: authConfig.KEY,
      notifications: PublishingOnDemandNotifications,
    }),
    OrganizationsInfrastructureModule,
  ],
  providers: [
    NotificationsPublisher,
    {
      provide: Inngest,
      inject: [appConfig.KEY, inngestConfig.KEY],
      useFactory: (app: AppConfig, { client }: InngestConfig) =>
        new Inngest({ id: app.name, ...client }),
    },
    {
      provide: WebEventsClient,
      inject: WebEventsClient.inject,
      useFactory: WebEventsClient.create,
    },
  ],
})
export class WebAppModule {}
