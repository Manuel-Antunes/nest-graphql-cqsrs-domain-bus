import { postsEntities } from '@nestposts/posts/infrastructure/posts-infrastructure.module';
import { eventStoreEntities } from '@nestposts/transport-eventbus/persistence/event-store/event-store.entity';
import { transportEntities } from '@nestposts/transport-eventbus/persistence/message-inbox.entity';
import { usersEntities } from '@nestposts/users/infrastructure/users-infrastructure.module';
import { migratedDatabase, taggingSchema } from './connection';

export default migratedDatabase({
  schema: taggingSchema(),
  folder: 'tagging',
  entities: [...postsEntities, ...usersEntities, ...transportEntities, ...eventStoreEntities],
});
