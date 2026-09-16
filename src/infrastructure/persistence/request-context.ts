import { EntityManager, MikroORM, RequestContext } from '@mikro-orm/core';

export function inRequestContext<T>(
  source: MikroORM | EntityManager,
  work: () => Promise<T>,
): Promise<T> {
  const root = (source as MikroORM).em ?? (source as EntityManager);
  return RequestContext.getEntityManager() ? work() : RequestContext.create(root, work);
}
