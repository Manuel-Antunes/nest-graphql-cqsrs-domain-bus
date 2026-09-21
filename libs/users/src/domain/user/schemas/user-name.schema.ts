import { z } from 'zod';

export const UserNameSchema = z
  .string()
  .trim()
  .min(1, 'name não pode ser vazio')
  .max(100, 'name excede 100 caracteres')
  .brand<'UserName'>();
