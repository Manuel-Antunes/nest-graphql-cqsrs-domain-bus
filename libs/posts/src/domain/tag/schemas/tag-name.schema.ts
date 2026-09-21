import { z } from 'zod';

export const TAG_NAME_MAX_LENGTH = 50;

export const TagNameSchema = z
  .string({ error: 'nome da tag não pode ser vazio' })
  .trim()
  .min(1, 'nome da tag não pode ser vazio')
  .max(TAG_NAME_MAX_LENGTH, `nome da tag excede ${TAG_NAME_MAX_LENGTH} caracteres`)
  .brand<'TagName'>();
