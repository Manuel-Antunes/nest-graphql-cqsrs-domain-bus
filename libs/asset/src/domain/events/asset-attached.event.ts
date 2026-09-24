import type { IEvent } from '@nestjs/cqrs';
import { ValidatedDto } from '@nestposts/validated-dto/mixins';

import { PersistAssetJobSchema } from '../schemas/persist-asset-job.schema';

export class AssetAttachedEvent
  extends ValidatedDto(PersistAssetJobSchema)
  implements IEvent {}
