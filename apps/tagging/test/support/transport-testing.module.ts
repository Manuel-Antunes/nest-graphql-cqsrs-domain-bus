import { type DynamicModule } from '@nestjs/common';
import { DatabaseModule } from '@nestposts/database';
import {
  TestSchemaModule,
  testDatabaseConfig,
} from '@nestposts/database/testing';
import { Post } from '@nestposts/posts/domain/post/post.entity';
import { postsEntities } from '@nestposts/posts/infrastructure/posts-infrastructure.module';
import {
  TransportEventBusModule,
  TransportIdentity,
} from '@nestposts/transport-eventbus';
import { usersEntities } from '@nestposts/users/infrastructure/users-infrastructure.module';

import { mikroOrmConfig } from '../../src/infrastructure/persistence/mikro-orm.config';

/** This service's connection, on a schema of its own, plus the domain mappings it rehydrates a Post through. */
export const persistenceTesting = (): DynamicModule[] => [
  DatabaseModule.forRoot(testDatabaseConfig(mikroOrmConfig(), 'tagging')),
  DatabaseModule.forFeature([...postsEntities, ...usersEntities]),
  TestSchemaModule.forRoot(),
];

/** The transport as a spec wants it: the event store of this service, publishing nowhere. */
export const transportTesting = (): DynamicModule =>
  TransportEventBusModule.forRoot({
    identity: TransportIdentity.silent('tagging-spec'),
    eventStore: [Post],
  });
