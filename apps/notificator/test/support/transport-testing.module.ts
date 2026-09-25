import { type DynamicModule } from '@nestjs/common';
import { DatabaseModule } from '@nestposts/database';
import {
  TestSchemaModule,
  testDatabaseConfig,
} from '@nestposts/database/testing';
import {
  TransportEventBusModule,
  TransportIdentity,
} from '@nestposts/transport-eventbus';

import { postgresConfig } from '../../src/config/postgres.config';
import { MikroOrmConfiguration } from '../../src/infrastructure/persistence/mikro-orm.config';

export const persistenceTesting = (): DynamicModule[] => [
  DatabaseModule.forRoot(
    testDatabaseConfig(
      MikroOrmConfiguration.connection(postgresConfig()),
      'notificator',
    ),
  ),
  TestSchemaModule.forRoot(),
];

export const transportTesting = (): DynamicModule =>
  TransportEventBusModule.forRoot({
    identity: TransportIdentity.silent('notificator-spec'),
  });
