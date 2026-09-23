import { EntityManager, MikroORM, RequestContext } from '@mikro-orm/core';
import type { Provider } from '@nestjs/common';
import type { IEvent } from '@nestjs/cqrs';
import { EventBus } from '@nestjs/cqrs';
import type { TestingModule } from '@nestjs/testing';
import { Test } from '@nestjs/testing';
import { CqsrsModule } from '@nestposts/cqsrs';
import { PostsInfrastructureModule } from '@nestposts/posts/infrastructure/posts-infrastructure.module';
import { TRANSPORT_EVENT_BUS_PUBLISHER } from '@nestposts/transport-eventbus';
import { UsersInfrastructureModule } from '@nestposts/users/infrastructure/users-infrastructure.module';

import {
  persistenceTesting,
  transportTesting,
} from './transport-testing.module';

export async function createCqrsTestingModule(
  providers: Provider[],
): Promise<TestingModule> {
  const module = await Test.createTestingModule({
    imports: [
      CqsrsModule.forRoot({
        aggregatePublisher: TRANSPORT_EVENT_BUS_PUBLISHER,
      }),
      ...persistenceTesting(),
      transportTesting(),
      PostsInfrastructureModule,
      UsersInfrastructureModule,
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

export class RecordingEvents {
  readonly events: IEvent[] = [];
  private readonly waiters: Array<() => void> = [];

  constructor(module: TestingModule) {
    module.get(EventBus).subscribe((event) => {
      this.events.push(event);
      this.waiters.splice(0).forEach((wake) => {
        wake();
      });
    });
  }

  ofType<T extends IEvent>(type: new (...args: never[]) => T): T[] {
    return this.events.filter((event): event is T => event instanceof type);
  }

  async waitFor(count: number, timeoutMs = 5000): Promise<IEvent[]> {
    const deadline = Date.now() + timeoutMs;
    while (this.events.length < count) {
      if (Date.now() > deadline) {
        throw new Error(
          `esperava ${count} eventos, gravei ${this.events.length}: ${this.events.map((e) => e.constructor.name)}`,
        );
      }
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
        setTimeout(resolve, 20);
      });
    }
    return this.events;
  }
}
