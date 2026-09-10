import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ValidatedDto } from '../../../validated-dto/mixins';

/** Identidade do User — ver {@link PostId} para o porquê de um value object gerado. */
export class UserId extends ValidatedDto.Scalar(z.uuid().brand<'UserId'>()) {
  static generate(): UserId {
    return UserId.parse(randomUUID());
  }
}
