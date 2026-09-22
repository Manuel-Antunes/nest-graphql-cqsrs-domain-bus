import { z } from 'zod';

export const MEMBER_ID_MAX_LENGTH = 64;

export const MemberIdSchema = z
  .string({ error: 'member id must not be empty' })
  .trim()
  .min(1, 'member id must not be empty')
  .max(MEMBER_ID_MAX_LENGTH, `member id exceeds ${MEMBER_ID_MAX_LENGTH} characters`)
  .brand<'MemberId'>();
