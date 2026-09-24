import type { MailRecipient } from '@nestposts/auth/mail/mail-recipient';
import { Mail } from '@nestposts/mail/mail';

import type { OrganizationInvitationNotificationData } from '../domain/organization/schemas/organization-invitation-notification.schema';
import { OrganizationInvitationTemplate } from './templates/organization-invitation.email';

export class OrganizationInvitationMail extends Mail {
  constructor(
    private readonly invitation: OrganizationInvitationNotificationData,
    private readonly recipient: MailRecipient,
  ) {
    super();
  }

  prepare(): void {
    this.message
      .to(this.recipient.address, this.recipient.name ?? undefined)
      .subject(
        `${this.invitation.inviterName} invited you to ${this.invitation.organizationName}`,
      )
      .view(OrganizationInvitationTemplate, {
        url: this.invitation.url,
        email: this.recipient.address,
        organizationName: this.invitation.organizationName,
        inviterName: this.invitation.inviterName,
        inviterEmail: this.invitation.inviterEmail,
        role: this.invitation.role,
        expirationHours: this.invitation.expiresInHours,
      });
  }
}
