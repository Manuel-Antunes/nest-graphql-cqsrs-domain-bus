import type { FactoryProvider } from '@nestjs/common';
import type { AuthConfig } from '@nestposts/auth/infrastructure/better-auth/config';
import { AuthExpirations } from '@nestposts/auth/infrastructure/better-auth/emails/auth-expirations';
import { BETTER_AUTH_CONFIG } from '@nestposts/auth/infrastructure/better-auth/tokens';
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

export const OrganizationBetterAuthPluginProvider = {
  provide: ORGANIZATION_BETTER_AUTH_PLUGIN,
  useFactory: (config: AuthConfig, notifications: OnDemandNotifications) =>
    organization({
      ac: organizationAccessControl,
      roles: organizationRoles,
      teams: { enabled: true },
      invitationExpiresIn: AuthExpirations.invitationSeconds,
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
  inject: [BETTER_AUTH_CONFIG, OnDemandNotifications],
} satisfies FactoryProvider;

export const organizationAuthPluginProviders = [
  OrganizationBetterAuthPluginProvider,
] as const;

export type OrganizationAuthPlugins = typeof organizationAuthPluginProviders;
