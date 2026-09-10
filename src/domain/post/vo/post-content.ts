import { z } from 'zod';
import { ValidatedDto } from '../../../validated-dto/mixins';

/** Corpo do Post: não vazio, sem limite de tamanho (a coluna é TEXT). */
export class PostContent extends ValidatedDto.Scalar(
  z
    .string({ error: 'content não pode ser vazio' })
    .trim()
    .min(1, 'content não pode ser vazio')
    .brand<'PostContent'>(),
) {}
