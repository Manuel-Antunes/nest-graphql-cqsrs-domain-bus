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

/**
 * O "fixture" dos testes de handler: o `CqsrsModule` de verdade (os buses do @nestjs/cqrs, o
 * `EventPublisher` e o `SubscriptionBus`), o MikroORM de verdade num SQLite em memória, os dois
 * repositórios — e **só os providers que o teste pede**.
 * Cada teste monta só o handler que testa, então uma dependência acidental entre dois deles quebra o
 * teste. É o papel que o `AxonTestFixture` tinha na versão Java.
 *
 * Um SQLite em memória sobe em milissegundos, então não há repositório fake: como salvar é
 * responsabilidade do command, o banco de verdade é o que prova que ele salvou — e o quê.
 */
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

/**
 * Roda algo **dentro de um contexto de request**, como o middleware do MikroORM faz na produção.
 *
 * Desde que os command handlers deixaram de abrir um fork por command (`@CreateRequestContext()`), o
 * contexto passou a nascer na **borda** — o `MikroOrmModule.forMiddleware()` no `app.module`. Num
 * teste não há requisição HTTP, então a borda é isto: um contexto por interação, e o mesmo para o
 * command, para os eventos que ele publica e para os commands que a saga despacha em cima deles.
 *
 * É também o que faz o teste exercitar o caminho de produção em vez de um mais frouxo: sem contexto,
 * `allowGlobalContext: false` recusaria a primeira consulta.
 */
export function inRequestContext<T>(module: TestingModule, work: () => Promise<T>): Promise<T> {
  return RequestContext.create(module.get(MikroORM).em, work);
}

/** Um EntityManager novo, fora de qualquer contexto de command: lê o que está de fato gravado. */
export function freshEm(module: TestingModule): EntityManager {
  return module.get(MikroORM).em.fork();
}

/** Grava eventos publicados no `EventBus` — o duplo de "quem ouve" para afirmar o que foi disparado. */
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

  /**
   * Espera até ter gravado `count` eventos. Para o que uma saga faz: o command devolve, e os eventos
   * da cadeia que ele abriu chegam depois, no seu próprio tempo.
   */
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
