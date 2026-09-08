import { z } from 'zod';

/** Corpo do Post: não vazio, sem limite de tamanho (a coluna é TEXT). */
export const PostContent = z
  .string({ error: 'content não pode ser vazio' })
  .trim()
  .min(1, 'content não pode ser vazio')
  .brand<'PostContent'>();
export type PostContent = z.infer<typeof PostContent>;
