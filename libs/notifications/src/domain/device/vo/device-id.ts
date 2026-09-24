import { randomUUID } from 'node:crypto';
import { ValidatedDto } from '@nestposts/validated-dto/mixins';

import { DeviceIdSchema } from '../schemas/device-id.schema';

export class DeviceId extends ValidatedDto.Scalar(DeviceIdSchema) {
  static generate(): DeviceId {
    return DeviceId.parse(randomUUID());
  }
}
