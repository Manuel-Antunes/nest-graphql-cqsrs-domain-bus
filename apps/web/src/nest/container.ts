import 'reflect-metadata';
import 'server-only';

import type { EntityManager } from '@mikro-orm/core';
import type { INestApplicationContext, Type } from '@nestjs/common';
import { headers } from 'next/headers';
import { MikroORM } from '@mikro-orm/core';
import { ContextIdFactory, NestFactory } from '@nestjs/core';
import { inRequestContext } from '@nestposts/database';

import { WebAppModule } from './app.module';

/**
 * A token as Nest accepts one — including an **abstract** class, which is how every port in this
 * repository is declared (`AuthService`, `OrganizationService`). Nest's own `Type<T>` is a concrete
 * constructor, so the abstract shape is spelled out here rather than cast at each call site.
 */
type Token<T> =
  Type<T> | (abstract new (...args: never[]) => T) | string | symbol;

const cache = globalThis as unknown as {
  __nestposts_web?: Promise<INestApplicationContext>;
};

/**
 * **The Nest container, booted once and kept on `globalThis`.**
 *
 * Once, because building it opens a database connection and constructs Better Auth; and on
 * `globalThis` rather than a module-level slot because Next re-evaluates modules on every change in
 * development, which would otherwise leave a new container — and a new pool — behind each time.
 */
export class Nest {
  static context(): Promise<INestApplicationContext> {
    cache.__nestposts_web ??= NestFactory.createApplicationContext(
      WebAppModule,
      {
        logger: ['error', 'warn'],
        abortOnError: false,
      },
    );
    return cache.__nestposts_web;
  }

  /** A singleton provider, for what does not belong to a request — the Better Auth instance itself. */
  static async get<T>(token: Token<T>): Promise<T> {
    const context = await Nest.context();
    return Nest.inDatabaseContext(
      context,
      context.get<T>(token as Type<T>, { strict: false }),
    );
  }

  /**
   * **A request-scoped provider, resolved for THIS Next request.**
   *
   * The incoming headers are registered as the request, so `@Inject(REQUEST)` receives them and
   * `AuthService` builds its `Headers` from them in the constructor — exactly as it does inside
   * `apps/posts-api`. That is the whole reason this container exists rather than a second, standalone
   * assembly: one wiring, and the services are the same objects on both sides.
   */
  static async resolve<T>(token: Token<T>): Promise<T> {
    const context = await Nest.context();
    const request = { headers: Object.fromEntries(await headers()) };

    const contextId = ContextIdFactory.create();
    context.registerRequestByContextId(request, contextId);

    return Nest.inDatabaseContext(
      context,
      await context.resolve<T>(token as Type<T>, contextId, { strict: false }),
    );
  }

  /**
   * Every method call wrapped in a MikroORM request context.
   *
   * Nothing opens one here: there is no Nest middleware and no interceptor, because Next owns the
   * request. `allowGlobalContext` is off, so the first query of an unwrapped call is refused — and
   * the alternative, turning it on, is one identity map shared by every request this server ever
   * answers.
   */
  private static inDatabaseContext<T>(
    context: INestApplicationContext,
    target: T,
  ): T {
    if (!target || typeof target !== 'object') {
      return target;
    }
    const em = context.get(MikroORM, { strict: false }).em as EntityManager;

    return new Proxy(target as T & object, {
      get(source, property, receiver) {
        const value = Reflect.get(source, property, receiver);
        if (typeof value !== 'function') {
          return value;
        }
        return (...args: unknown[]) =>
          inRequestContext(em, async () =>
            (value as (...rest: unknown[]) => unknown).apply(source, args),
          );
      },
    }) as T;
  }
}
