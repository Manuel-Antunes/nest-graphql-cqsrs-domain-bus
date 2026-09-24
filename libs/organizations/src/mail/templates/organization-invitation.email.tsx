import { APP_NAME } from '@nestposts/auth/domain/auth/app-name';
import { defineEmailTemplate } from '@nestposts/mail/email-template';

import { OrganizationInvitationEmail } from '../components/organization-invitation';

export interface OrganizationInvitationTemplateProps {
  url: string;
  email: string;
  organizationName: string;
  inviterName: string;
  inviterEmail: string;
  role: string | null;
  expirationHours: number;
}

export const OrganizationInvitationTemplate = defineEmailTemplate(
  'organizations/invitation',
  ({
    url,
    email,
    organizationName,
    inviterName,
    inviterEmail,
    role,
    expirationHours,
  }: OrganizationInvitationTemplateProps) => (
    <OrganizationInvitationEmail
      url={url}
      email={email}
      organizationName={organizationName}
      inviterName={inviterName}
      inviterEmail={inviterEmail}
      role={role ?? undefined}
      expirationHours={expirationHours}
      appName={APP_NAME}
    />
  ),
);
