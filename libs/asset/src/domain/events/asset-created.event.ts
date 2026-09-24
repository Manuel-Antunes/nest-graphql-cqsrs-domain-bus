import type { IEvent } from '@nestjs/cqrs';
import { ValidatedDto } from '@nestposts/validated-dto/mixins';

import { AssetSchema } from '../schemas/asset.schema';

export class AssetCreatedEvent
  extends ValidatedDto(AssetSchema)
  implements IEvent {}
