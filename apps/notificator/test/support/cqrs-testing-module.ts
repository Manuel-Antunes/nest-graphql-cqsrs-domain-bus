import { EntityManager, MikroORM, RequestContext } from '@mikro-orm/core';
import type { ModuleMetadata, Provider } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { CqsrsModule } from '@nestposts/cqsrs';
import { TRANSPORT_EVENT_BUS_PUBLISHER } from '@nestposts/transport-eventbus';

import {
  persistenceTesting,
  transportTesting,
} from './transport-testing.module';

export async function createCqrsTestingModule(
  providers: Provider[],
  imports: NonNullable<ModuleMetadata['imports']> = [],
): Promise<TestingModule> {
  const module = await Test.createTestingModule({
    imports: [
      CqsrsModule.forRoot({
        aggregatePublisher: TRANSPORT_EVENT_BUS_PUBLISHER,
      }),
      ...persistenceTesting(),
      transportTesting(),
      ...imports,
    ],
    providers: [...providers],
  }).compile();
  await module.init();
  return module;
}

export function inRequestContext<T>(
  module: TestingModule,
  work: () => Promise<T>,
): Promise<T> {
  return RequestContext.create(module.get(MikroORM).em, work);
}

export function freshEm(module: TestingModule): EntityManager {
  return module.get(MikroORM).em.fork();
}
