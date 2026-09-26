import { z } from 'zod';

export const TEAM_NAME_MAX_LENGTH = 255;

export const TeamNameSchema = z
  .string({ error: 'team name must not be empty' })
  .trim()
  .min(1, 'team name must not be empty')
  .max(
    TEAM_NAME_MAX_LENGTH,
    `team name exceeds ${TEAM_NAME_MAX_LENGTH} characters`,
  )
  .brand<'TeamName'>();
