import { type DynamicModule } from '@nestjs/common';
import { DatabaseModule } from '@nestposts/database';
import { TestSchemaModule, testSchema } from '@nestposts/database/testing';
import {
  MikroOrmMessageInbox,
  TransportEventBusModule,
  TransportIdentity,
} from '@nestposts/transport-eventbus';

import { PostRequestContextCodec } from '../../src/application/shared/post-request-context.codec';
import { mikroOrmConfig } from '../../src/infrastructure/persistence/mikro-orm.config';

/** This application's connection, on a schema of its own. Every table arrives through the module that owns it. */
export const persistenceTesting = (): DynamicModule[] => [
  DatabaseModule.forRoot(mikroOrmConfig(testSchema('posts_api'))),
  TestSchemaModule.forRoot(),
];

/** The transport as a spec wants it: everything this application binds, publishing nowhere. */
export const transportTesting = (): DynamicModule =>
  TransportEventBusModule.forRoot({
    identity: TransportIdentity.silent('posts-api-spec'),
    inbox: MikroOrmMessageInbox,
    requestContext: PostRequestContextCodec,
  });
