import { Module } from '@nestjs/common';
import { DatabaseModule } from '@nestposts/database';

import { CHECKPOINT_ENTITIES } from './checkpoint-orm.entities';

@Module({
  imports: [DatabaseModule.forFeature(CHECKPOINT_ENTITIES)],
})
export class CheckpointDatabaseModule {}
