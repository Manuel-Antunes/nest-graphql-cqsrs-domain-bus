import { type DynamicModule } from '@nestjs/common';
import { OutboxModule } from '@nestjs/outbox';
import { DatabaseModule } from '@nestposts/database';
import {
  TestSchemaModule,
  testDatabaseConfig,
} from '@nestposts/database/testing';
import {
  MikroOrmOutboxModule,
  MikroOrmOutboxStore,
  MikroOrmTransactionManager,
} from '@nestposts/outbox-mikro-orm';
import {
  TransportEventBusModule,
  TransportIdentity,
} from '@nestposts/transport-eventbus';

import { PostRequestContextCodec } from '../../src/application/shared/post-request-context.codec';
import { postgresConfig } from '../../src/config/postgres.config';
import { MikroOrmConfiguration } from '../../src/infrastructure/persistence/mikro-orm.config';

/** This application's connection, on a schema of its own. Every table arrives through the module that owns it. */
export const persistenceTesting = (): DynamicModule[] => [
  DatabaseModule.forRoot(
    testDatabaseConfig(
      MikroOrmConfiguration.connection(postgresConfig()),
      'posts_api',
    ),
  ),
  TestSchemaModule.forRoot(),
];

/** The transport as a spec wants it: everything this application binds, publishing nowhere. */
export const transportTesting = (): DynamicModule[] => [
  OutboxModule.forRoot({ relay: { enabled: false } }),
  MikroOrmOutboxModule.forRoot({ producer: 'posts-api-spec' }),
  TransportEventBusModule.forRoot({
    identity: TransportIdentity.silent('posts-api-spec'),
    transactionManager: MikroOrmTransactionManager,
    inbox: { descriptions: MikroOrmOutboxStore },
    requestContext: PostRequestContextCodec,
  }),
];
