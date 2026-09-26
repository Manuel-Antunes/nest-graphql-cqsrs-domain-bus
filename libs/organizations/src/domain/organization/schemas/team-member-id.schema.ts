import { z } from 'zod';

export const TEAM_MEMBER_ID_MAX_LENGTH = 64;

export const TeamMemberIdSchema = z
  .string({ error: 'team member id must not be empty' })
  .trim()
  .min(1, 'team member id must not be empty')
  .max(
    TEAM_MEMBER_ID_MAX_LENGTH,
    `team member id exceeds ${TEAM_MEMBER_ID_MAX_LENGTH} characters`,
  )
  .brand<'TeamMemberId'>();
