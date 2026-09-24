import 'server-only';

import { Module } from '@nestjs/common';
import { BetterAuthModule } from '@nestposts/auth/infrastructure/better-auth/better-auth.module';
import { CqsrsModule } from '@nestposts/cqsrs';
import {
  DatabaseModule,
  POSTS_SCHEMA,
  postgresDatabase,
} from '@nestposts/database';
import { PublishingOnDemandNotifications } from '@nestposts/notifications/infrastructure/on-demand/publishing-on-demand-notifications';
import { organizationAuthPluginProviders } from '@nestposts/organizations/infrastructure/better-auth/organization-better-auth.plugin';
import { OrganizationsInfrastructureModule } from '@nestposts/organizations/infrastructure/organizations-infrastructure.module';
import { OrganizationEntities } from '@nestposts/organizations/infrastructure/persistence/organization-entities';
import {
  TRANSPORT_EVENT_BUS_PUBLISHER,
  TransportEventBusModule,
} from '@nestposts/transport-eventbus';

import { WEB_URL } from '@/lib/env';

import { NextCookiesBetterAuthPluginProvider } from './next-cookies.plugin';
import { NotificationsPublisher } from './notifications.publisher';
import { WEB_EVENTS_CLIENT, webEventsClient, webIdentity } from './transport';

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
 * It PUBLISHES, too, and only that: the emails Better Auth asks for — a verification link, a reset,
 * a one-time code — are notifications, and they leave through the transport for `apps/notificator`
 * to deliver. No inbox and no event log, because nothing arrives here.
 */
@Module({
  imports: [
    CqsrsModule.forRoot({ aggregatePublisher: TRANSPORT_EVENT_BUS_PUBLISHER }),
    DatabaseModule.forRoot(
      postgresDatabase(process.env.POSTS_SCHEMA ?? POSTS_SCHEMA),
    ),
    TransportEventBusModule.forRoot({
      identity: webIdentity(),
      publishers: [
        NotificationsPublisher,
        { provide: WEB_EVENTS_CLIENT, useFactory: webEventsClient },
      ],
    }),
    BetterAuthModule.forRoot({
      plugins: organizationAuthPluginProviders,
      trailingPlugins: [NextCookiesBetterAuthPluginProvider],
      entities: OrganizationEntities.withAuth(),
      imports: [OrganizationsInfrastructureModule],
      config: { baseUrl: WEB_URL, trustedOrigins: [WEB_URL] },
      notifications: PublishingOnDemandNotifications,
    }),
    OrganizationsInfrastructureModule,
  ],
})
export class WebAppModule {}
