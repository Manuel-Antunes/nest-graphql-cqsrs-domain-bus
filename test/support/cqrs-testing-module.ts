import { EntityManager, MikroORM } from '@mikro-orm/core';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import type { Provider } from '@nestjs/common';
import { CqrsModule, EventBus, type IEvent } from '@nestjs/cqrs';
import { Test, type TestingModule } from '@nestjs/testing';
import { PostRepository } from '../../src/domain/post/post.repository';
import { TagRepository } from '../../src/domain/tag/tag.repository';
import { MikroOrmPostRepository } from '../../src/infrastructure/persistence/sqlite/mikro-orm-post.repository';
import { MikroOrmTagRepository } from '../../src/infrastructure/persistence/sqlite/mikro-orm-tag.repository';
import { mikroOrmConfig } from '../../src/infrastructure/persistence/sqlite/mikro-orm.config';

/**
 * O "fixture" dos testes de handler: o `CqrsModule` de verdade (buses, `EventPublisher`), o MikroORM
 * de verdade num SQLite em memória, os dois repositórios — e **só os providers que o teste pede**.
 * Cada teste monta só o handler que testa, então uma dependência acidental entre dois deles quebra o
 * teste. É o papel que o `AxonTestFixture` tinha na versão Java.
 *
 * Um SQLite em memória sobe em milissegundos, então não há repositório fake: como salvar é
 * responsabilidade do command, o banco de verdade é o que prova que ele salvou — e o quê.
 */
export async function createCqrsTestingModule(providers: Provider[]): Promise<TestingModule> {
  const module = await Test.createTestingModule({
    imports: [CqrsModule.forRoot(), MikroOrmModule.forRoot(mikroOrmConfig(':memory:'))],
    providers: [
      ...providers,
      { provide: PostRepository, useClass: MikroOrmPostRepository },
      { provide: TagRepository, useClass: MikroOrmTagRepository },
    ],
  }).compile();
  await module.init();
  return module;
}

/** Um EntityManager novo, fora de qualquer contexto de command: lê o que está de fato gravado. */
export function freshEm(module: TestingModule): EntityManager {
  return module.get(MikroORM).em.fork();
}

/** Grava eventos publicados no `EventBus` — o duplo de "quem ouve" para afirmar o que foi disparado. */
export class RecordingEvents {
  readonly events: IEvent[] = [];

  constructor(module: TestingModule) {
    module.get(EventBus).subscribe((event) => this.events.push(event));
  }

  ofType<T extends IEvent>(type: new (...args: never[]) => T): T[] {
    return this.events.filter((event): event is T => event instanceof type);
  }
}
