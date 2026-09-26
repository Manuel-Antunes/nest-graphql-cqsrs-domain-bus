import { z } from 'zod';

export const TEAM_ID_MAX_LENGTH = 64;

export const TeamIdSchema = z
  .string({ error: 'team id must not be empty' })
  .trim()
  .min(1, 'team id must not be empty')
  .max(TEAM_ID_MAX_LENGTH, `team id exceeds ${TEAM_ID_MAX_LENGTH} characters`)
  .brand<'TeamId'>();
