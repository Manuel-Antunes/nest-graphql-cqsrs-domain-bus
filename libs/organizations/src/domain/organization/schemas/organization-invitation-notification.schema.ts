import { z } from 'zod';

import { INVITATION_ID_MAX_LENGTH } from './invitation-id.schema';

export const OrganizationInvitationNotificationSchema = z.object({
  invitationId: z.string().min(1).max(INVITATION_ID_MAX_LENGTH),
  organizationName: z.string().min(1),
  inviterName: z.string().min(1),
  inviterEmail: z.email(),
  role: z.string().min(1).nullable(),
  url: z.url(),
  expiresInHours: z.number().int().positive(),
});

export type OrganizationInvitationNotificationData = z.infer<
  typeof OrganizationInvitationNotificationSchema
>;
