import { z } from 'zod';

export const INVITATION_ID_MAX_LENGTH = 64;

export const InvitationIdSchema = z
  .string({ error: 'invitation id must not be empty' })
  .trim()
  .min(1, 'invitation id must not be empty')
  .max(INVITATION_ID_MAX_LENGTH, `invitation id exceeds ${INVITATION_ID_MAX_LENGTH} characters`)
  .brand<'InvitationId'>();
