import { AutoMap } from '@automapper/classes';
import { DevicePlatformSchema } from '@nestposts/notifications/domain/device/schemas/device-platform.schema';
import {
  InheritValidatedMetadata,
  ValidatedDto,
} from '@nestposts/validated-dto/mixins';
import { z } from 'zod';

import { AUTOMAP_REGISTRY } from './automap.registry';

const DeviceViewSchema = z.object({
  id: z.string().register(AUTOMAP_REGISTRY, { decorators: [AutoMap()] }),
  deviceId: z.string().register(AUTOMAP_REGISTRY, { decorators: [AutoMap()] }),
  platform: DevicePlatformSchema.register(AUTOMAP_REGISTRY, {
    decorators: [AutoMap(() => String)],
  }),
  createdAt: z
    .date()
    .register(AUTOMAP_REGISTRY, { decorators: [AutoMap(() => Date)] }),
});

@InheritValidatedMetadata()
export class DeviceView extends ValidatedDto(DeviceViewSchema, {
  DECORATOR_REGISTRY: AUTOMAP_REGISTRY,
}) {}
