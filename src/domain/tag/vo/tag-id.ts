import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { ValidatedDto } from '../../../validated-dto/mixins';

/** Identidade da Tag — ver {@link PostId} para o porquê de um value object gerado. */
export class TagId extends ValidatedDto.Scalar(z.uuid().brand<'TagId'>()) {
  static generate(): TagId {
    return TagId.parse(randomUUID());
  }
}
