import { z } from 'zod';

export const CLIENT_NAME_MAX_LENGTH = 200;

export const ClientNameSchema = z
  .string({ error: 'name must not be empty' })
  .trim()
  .min(1, 'name must not be empty')
  .max(
    CLIENT_NAME_MAX_LENGTH,
    `name exceeds ${CLIENT_NAME_MAX_LENGTH} characters`,
  )
  .brand<'ClientName'>();
