import { z } from 'zod';

export const PostContentSchema = z
  .string({ error: 'content não pode ser vazio' })
  .trim()
  .min(1, 'content não pode ser vazio')
  .brand<'PostContent'>();
