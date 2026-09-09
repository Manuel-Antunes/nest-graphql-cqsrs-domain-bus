import { z } from 'zod';

export const AUTHOR_MAX_LENGTH = 100;

/** Autor do Post: não vazio, no máximo 100 caracteres. */
export const Author = z
  .string({ error: 'author não pode ser vazio' })
  .trim()
  .min(1, 'author não pode ser vazio')
  .max(AUTHOR_MAX_LENGTH, `author excede ${AUTHOR_MAX_LENGTH} caracteres`)
  .brand<'Author'>();
export type Author = z.infer<typeof Author>;
