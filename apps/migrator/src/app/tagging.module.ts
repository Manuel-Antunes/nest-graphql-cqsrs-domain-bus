import { Module } from '@nestjs/common';
import { DatabaseModule } from '@nestposts/database';
import { postsEntities } from '@nestposts/posts/infrastructure/posts-infrastructure.module';
import { eventLogEntities } from '@nestposts/transport-eventbus/persistence/event-log/event-log.entity';
import { transportEntities } from '@nestposts/transport-eventbus/persistence/message-inbox.entity';
import { usersEntities } from '@nestposts/users/infrastructure/users-infrastructure.module';
import { taggingConnection } from './connections';

@Module({
  imports: [
    DatabaseModule.forRoot({ ...taggingConnection(), exclusive: true }),
    DatabaseModule.forFeature([
      ...postsEntities,
      ...usersEntities,
      ...transportEntities,
      ...eventLogEntities,
    ]),
  ],
})
export class TaggingMigratorModule {}
