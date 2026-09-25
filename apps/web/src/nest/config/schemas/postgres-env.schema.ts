import { z } from 'zod';

export const PostgresEnvSchema = z.object({
  POSTGRES_URL: z
    .string()
    .min(1)
    .default('postgresql://nestposts:nestposts@localhost:5432/nestposts'),
  MIKRO_ORM_DEBUG: z.stringbool().default(false),
});
