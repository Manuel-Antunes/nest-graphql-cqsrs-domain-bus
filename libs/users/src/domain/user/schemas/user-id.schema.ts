import { z } from 'zod';

export const USER_ID_MAX_LENGTH = 64;

export const UserIdSchema = z
  .string({ error: 'user id cannot be empty' })
  .trim()
  .min(1, 'user id cannot be empty')
  .max(USER_ID_MAX_LENGTH, `user id exceeds ${USER_ID_MAX_LENGTH} characters`)
  .brand<'UserId'>();
