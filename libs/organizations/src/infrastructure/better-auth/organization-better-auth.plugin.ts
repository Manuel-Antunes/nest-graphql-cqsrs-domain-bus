import type { FactoryProvider } from '@nestjs/common';
import { organization } from 'better-auth/plugins';
import type { AuthConfig } from '@nestposts/auth/infrastructure/better-auth/config';
import { BETTER_AUTH_CONFIG } from '@nestposts/auth/infrastructure/better-auth/tokens';
import { Email } from '@nestposts/users/domain/user/vo/email';
import { UserName } from '@nestposts/users/domain/user/vo/user-name';
import { InvitationNotifier } from '../../domain/organization/invitation.notifier';
import { InvitationId } from '../../domain/organization/vo/invitation-id';
import { MemberRole } from '../../domain/organization/vo/member-role';
import { OrganizationName } from '../../domain/organization/vo/organization-name';
import { organizationAccessControl, organizationRoles } from './access';

export const ORGANIZATION_BETTER_AUTH_PLUGIN = 'BETTER_AUTH_PLUGIN_ORGANIZATION';

export const OrganizationBetterAuthPluginProvider = {
  provide: ORGANIZATION_BETTER_AUTH_PLUGIN,
  useFactory: (config: AuthConfig, notifier: InvitationNotifier) =>
    organization({
      ac: organizationAccessControl,
      roles: organizationRoles,
      async sendInvitationEmail(data) {
        const role = MemberRole.safeParse(data.role);
        await notifier.invited({
          invitationId: InvitationId.parse(data.id),
          email: Email.parse(data.email),
          role: role.success ? role.data : null,
          organization: OrganizationName.parse(data.organization.name),
          invitedBy: UserName.parse(data.inviter.user.name),
          acceptUrl: `${config.webUrl}/accept-invitation/${data.id}`,
        });
      },
    }),
  inject: [BETTER_AUTH_CONFIG, InvitationNotifier],
} satisfies FactoryProvider;

export const organizationAuthPluginProviders = [OrganizationBetterAuthPluginProvider] as const;

export type OrganizationAuthPlugins = typeof organizationAuthPluginProviders;
