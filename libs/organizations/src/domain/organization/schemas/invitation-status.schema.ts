import { z } from 'zod';

export const PENDING_INVITATION = 'pending';

export const ACCEPTED_INVITATION = 'accepted';

export const REJECTED_INVITATION = 'rejected';

export const CANCELED_INVITATION = 'canceled';

export const INVITATION_STATUSES = [
  PENDING_INVITATION,
  ACCEPTED_INVITATION,
  REJECTED_INVITATION,
  CANCELED_INVITATION,
] as const;

export type InvitationStatusValue = (typeof INVITATION_STATUSES)[number];

export const INVITATION_STATUS_MAX_LENGTH = 32;

export const InvitationStatusSchema = z
  .string({ error: 'invitation status must not be empty' })
  .trim()
  .toLowerCase()
  .min(1, 'invitation status must not be empty')
  .max(
    INVITATION_STATUS_MAX_LENGTH,
    `invitation status exceeds ${INVITATION_STATUS_MAX_LENGTH} characters`,
  )
  .brand<'InvitationStatus'>();
