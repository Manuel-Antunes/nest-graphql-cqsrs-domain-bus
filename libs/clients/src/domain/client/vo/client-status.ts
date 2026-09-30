import { ValidatedDto } from '@nestposts/validated-dto/mixins';

import {
  ClientStatusSchema,
  DEFAULT_CLIENT_STATUS,
} from '../schemas/client-status.schema';

export class ClientStatus extends ValidatedDto.Scalar(ClientStatusSchema) {
  static standard(): ClientStatus {
    return ClientStatus.parse(DEFAULT_CLIENT_STATUS);
  }

  get isActive(): boolean {
    return this.value === 'ACTIVE';
  }
}
