import { randomUUID } from 'node:crypto';
import { ValidatedDto } from '@nestposts/validated-dto/mixins';

import { ClientIdSchema } from '../schemas/client-id.schema';

export class ClientId extends ValidatedDto.Scalar(ClientIdSchema) {
  static generate(): ClientId {
    return ClientId.parse(randomUUID());
  }
}
