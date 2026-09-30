import { ValidatedDto } from '@nestposts/validated-dto/mixins';

import {
  ClientKindSchema,
  DEFAULT_CLIENT_KIND,
} from '../schemas/client-kind.schema';

export class ClientKind extends ValidatedDto.Scalar(ClientKindSchema) {
  static standard(): ClientKind {
    return ClientKind.parse(DEFAULT_CLIENT_KIND);
  }
}
