import { AutoMap } from '@automapper/classes';
import {
  InheritValidatedMetadata,
  ValidatedDto,
} from '@nestposts/validated-dto/mixins';
import { z } from 'zod';

import { AUTOMAP_REGISTRY } from './automap.registry';

const AssetViewSchema = z.object({
  name: z.string().register(AUTOMAP_REGISTRY, { decorators: [AutoMap()] }),
  size: z.number().register(AUTOMAP_REGISTRY, { decorators: [AutoMap()] }),
  extname: z.string().register(AUTOMAP_REGISTRY, { decorators: [AutoMap()] }),
  mimeType: z.string().register(AUTOMAP_REGISTRY, { decorators: [AutoMap()] }),
  url: z
    .string()
    .nullable()
    .register(AUTOMAP_REGISTRY, { decorators: [AutoMap()] }),
});

@InheritValidatedMetadata()
export class AssetView extends ValidatedDto(AssetViewSchema, {
  DECORATOR_REGISTRY: AUTOMAP_REGISTRY,
}) {}
