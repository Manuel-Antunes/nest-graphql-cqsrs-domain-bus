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

export const persistenceTesting = (): DynamicModule[] => [
  DatabaseModule.forRoot(testDatabaseConfig({}, 'notificator')),
  TestSchemaModule.forRoot(),
];

export const transportTesting = (): DynamicModule =>
  TransportEventBusModule.forRoot({
    identity: TransportIdentity.silent('notificator-spec'),
  });
