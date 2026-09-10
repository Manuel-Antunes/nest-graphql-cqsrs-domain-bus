import { z } from 'zod';
import { ValidatedDto } from '../../../validated-dto/mixins';

/** O nome de exibição de um User. */
export class UserName extends ValidatedDto.Scalar(
  z.string().trim().min(1, 'name não pode ser vazio').max(100, 'name excede 100 caracteres').brand<'UserName'>(),
) {}
