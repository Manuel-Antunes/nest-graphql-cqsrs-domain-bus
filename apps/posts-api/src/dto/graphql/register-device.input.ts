import { NewDeviceSchema } from '@nestposts/notifications/domain/device/schemas/new-device.schema';
import { ValidatedDto } from '@nestposts/validated-dto/mixins';

export class RegisterDeviceInput extends ValidatedDto(
  NewDeviceSchema.pick({ token: true, deviceId: true, platform: true }),
) {}
