import { AutoMap } from '@automapper/classes';
import {
  InheritValidatedMetadata,
  ValidatedDto,
} from '@nestposts/validated-dto/mixins';
import { z } from 'zod';

import { AUTOMAP_REGISTRY } from './automap.registry';

const NotificationViewSchema = z.object({
  id: z.string().register(AUTOMAP_REGISTRY, { decorators: [AutoMap()] }),
  type: z.string().register(AUTOMAP_REGISTRY, { decorators: [AutoMap()] }),
  data: z
    .record(z.string(), z.unknown())
    .register(AUTOMAP_REGISTRY, { decorators: [AutoMap(() => Object)] }),
  read: z.boolean().register(AUTOMAP_REGISTRY, { decorators: [AutoMap()] }),
  readAt: z
    .date()
    .nullable()
    .register(AUTOMAP_REGISTRY, { decorators: [AutoMap(() => Date)] }),
  createdAt: z
    .date()
    .register(AUTOMAP_REGISTRY, { decorators: [AutoMap(() => Date)] }),
});

@InheritValidatedMetadata()
export class NotificationView extends ValidatedDto(NotificationViewSchema, {
  DECORATOR_REGISTRY: AUTOMAP_REGISTRY,
}) {}
