import { z } from 'zod';

export const POST_TITLE_MAX_LENGTH = 200;

/**
 * Título do Post. A invariante ("não vazio, no máximo 200 caracteres") e a normalização (`trim`)
 * moram aqui, não espalhadas pela entidade ou pelos handlers. `.brand()` faz o tipo `PostTitle` ser
 * diferente de `string`: só o `parse` produz um, então um `PostTitle` que existe é sempre válido.
 */
export const PostTitle = z
  .string({ error: 'title não pode ser vazio' })
  .trim()
  .min(1, 'title não pode ser vazio')
  .max(POST_TITLE_MAX_LENGTH, `title excede ${POST_TITLE_MAX_LENGTH} caracteres`)
  .brand<'PostTitle'>();
export type PostTitle = z.infer<typeof PostTitle>;
