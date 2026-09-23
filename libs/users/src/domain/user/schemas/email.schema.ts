import { z } from 'zod';

export const EmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('email inválido'))
  .brand<'Email'>();
