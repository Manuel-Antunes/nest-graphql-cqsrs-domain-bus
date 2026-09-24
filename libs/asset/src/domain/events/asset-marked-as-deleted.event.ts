import type { IEvent } from '@nestjs/cqrs';
import { ValidatedDto } from '@nestposts/validated-dto/mixins';

import { AssetSchema } from '../schemas/asset.schema';

export class AssetMarkedAsDeletedEvent
  extends ValidatedDto(AssetSchema)
  implements IEvent {}
