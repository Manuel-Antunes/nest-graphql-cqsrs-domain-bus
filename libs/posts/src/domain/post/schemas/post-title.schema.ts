import { z } from 'zod';

export const POST_TITLE_MAX_LENGTH = 200;

export const PostTitleSchema = z
  .string({ error: 'title não pode ser vazio' })
  .trim()
  .min(1, 'title não pode ser vazio')
  .max(
    POST_TITLE_MAX_LENGTH,
    `title excede ${POST_TITLE_MAX_LENGTH} caracteres`,
  )
  .brand<'PostTitle'>();
