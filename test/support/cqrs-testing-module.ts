import { EntityManager, MikroORM, RequestContext } from '@mikro-orm/core';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import type { Provider } from '@nestjs/common';
import { EventBus, type IEvent } from '@nestjs/cqrs';
import { Test, type TestingModule } from '@nestjs/testing';
import { CqsrsModule } from '../../src/cqsrs';
import { PostRepository } from '../../src/domain/post/post.repository';
import { TagRepository } from '../../src/domain/tag/tag.repository';
import { UserRepository } from '../../src/domain/user/user.repository';
import { MikroOrmPostRepository } from '../../src/infrastructure/persistence/sqlite/repositories/mikro-orm-post.repository';
import { MikroOrmTagRepository } from '../../src/infrastructure/persistence/sqlite/repositories/mikro-orm-tag.repository';
import { MikroOrmUserRepository } from '../../src/infrastructure/persistence/sqlite/repositories/mikro-orm-user.repository';
import { mikroOrmConfig } from '../../src/infrastructure/persistence/sqlite/mikro-orm.config';

export async function createCqrsTestingModule(providers: Provider[]): Promise<TestingModule> {
  const module = await Test.createTestingModule({
    imports: [CqsrsModule.forRoot(), MikroOrmModule.forRoot(mikroOrmConfig(':memory:'))],
    providers: [
      ...providers,
      { provide: PostRepository, useClass: MikroOrmPostRepository },
      { provide: TagRepository, useClass: MikroOrmTagRepository },
      { provide: UserRepository, useClass: MikroOrmUserRepository },
    ],
  }).compile();
  await module.init();
  return module;
}

export function inRequestContext<T>(module: TestingModule, work: () => Promise<T>): Promise<T> {
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
      this.waiters.splice(0).forEach((wake) => wake());
    });
  }

  ofType<T extends IEvent>(type: new (...args: never[]) => T): T[] {
    return this.events.filter((event): event is T => event instanceof type);
  }

  async waitFor(count: number, timeoutMs = 5000): Promise<IEvent[]> {
    const deadline = Date.now() + timeoutMs;
    while (this.events.length < count) {
      if (Date.now() > deadline) {
        throw new Error(`esperava ${count} eventos, gravei ${this.events.length}: ${this.events.map((e) => e.constructor.name)}`);
      }
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
        setTimeout(resolve, 20);
      });
    }
    return this.events;
  }
}
