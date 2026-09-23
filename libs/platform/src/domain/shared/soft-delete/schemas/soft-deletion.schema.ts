import { z } from 'zod';

export const SoftDeletionSchema = z.object({
  deletedAt: z.date().nullable().default(null),
});
