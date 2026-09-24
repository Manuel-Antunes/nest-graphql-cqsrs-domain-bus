import type { FactoryProvider } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import type { AuthConfig } from '@nestposts/auth/infrastructure/better-auth/config';
import { AuthExpirations } from '@nestposts/auth/infrastructure/better-auth/emails/auth-expirations';
import { BETTER_AUTH_CONFIG } from '@nestposts/auth/infrastructure/better-auth/tokens';
import { TenantEntityManagerService } from '@nestposts/database';
import { EMAIL_CHANNEL } from '@nestposts/notifications/domain/channel/channel-names';
import { OnDemandNotifiable } from '@nestposts/notifications/domain/notification/on-demand-notifiable';
import { OnDemandNotifications } from '@nestposts/notifications/domain/notification/on-demand-notifications';
import { organization } from 'better-auth/plugins';

import { OrganizationInvitationNotification } from '../../domain/organization/notification/organization-invitation.notification';
import { organizationAccessControl, organizationRoles } from './access';

export const ORGANIZATION_BETTER_AUTH_PLUGIN =
  'BETTER_AUTH_PLUGIN_ORGANIZATION';

const SECONDS_IN_AN_HOUR = 3600;

export class OrganizationInvitations {
  /** Where an invitation is accepted: the web's accept-invitation view, which signs the invitee in first. */
  static acceptUrl(config: Pick<AuthConfig, 'webUrl'>, invitationId: string) {
    const url = new URL('/auth/accept-invitation', config.webUrl);
    url.searchParams.set('invitationId', invitationId);
    return url.toString();
  }
}

/**
 * **Every organization is a tenant, and its schema is made when it is.** The organization row's
 * trigger creates `tenant_<slug>`; this migrates it, so the organization's first request — which is
 * the one right after it becomes the active one — finds its tables already there. A process with no
 * tenancy (the migrator) has nothing to migrate with, and a migration that fails here is only logged:
 * either way the schema exists, and the tenant's first request migrates it.
 */
export const OrganizationBetterAuthPluginProvider = {
  provide: ORGANIZATION_BETTER_AUTH_PLUGIN,
  useFactory: (
    config: AuthConfig,
    notifications: OnDemandNotifications,
    tenants?: TenantEntityManagerService,
  ) =>
    organization({
      ac: organizationAccessControl,
      roles: organizationRoles,
      teams: { enabled: true },
      invitationExpiresIn: AuthExpirations.invitationSeconds,
      organizationHooks: {
        afterCreateOrganization: async ({ organization }) => {
          await tenants
            ?.provision(organization.slug)
            .catch((error: unknown) =>
              new Logger(ORGANIZATION_BETTER_AUTH_PLUGIN).warn(
                `the tenant of ${organization.slug} was not migrated now; its first request will: ${(error as Error)?.message ?? String(error)}`,
              ),
            );
        },
      },
      sendInvitationEmail: ({ id, email, role, organization, inviter }) =>
        notifications.send(
          OnDemandNotifiable.route(EMAIL_CHANNEL, email),
          new OrganizationInvitationNotification({
            invitationId: id,
            organizationName: organization.name,
            inviterName: inviter.user.name,
            inviterEmail: inviter.user.email,
            role: role || null,
            url: OrganizationInvitations.acceptUrl(config, id),
            expiresInHours:
              AuthExpirations.invitationSeconds / SECONDS_IN_AN_HOUR,
          }),
        ),
    }),
  inject: [
    BETTER_AUTH_CONFIG,
    OnDemandNotifications,
    { token: TenantEntityManagerService, optional: true },
  ],
} satisfies FactoryProvider;

export const organizationAuthPluginProviders = [
  OrganizationBetterAuthPluginProvider,
] as const;

export type OrganizationAuthPlugins = typeof organizationAuthPluginProviders;
