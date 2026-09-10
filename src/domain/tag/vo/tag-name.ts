import { z } from 'zod';
import { ValidatedDto } from '../../../validated-dto/mixins';

export const TAG_NAME_MAX_LENGTH = 50;

/** Nome da Tag: não vazio, no máximo 50 caracteres, sem espaços nas pontas. Único no banco. */
export class TagName extends ValidatedDto.Scalar(
  z
    .string({ error: 'nome da tag não pode ser vazio' })
    .trim()
    .min(1, 'nome da tag não pode ser vazio')
    .max(TAG_NAME_MAX_LENGTH, `nome da tag excede ${TAG_NAME_MAX_LENGTH} caracteres`)
    .brand<'TagName'>(),
) {}
