// biome-ignore-all assist/source/organizeImports: the local modules load BEFORE the `@mikro-orm/core` re-export. Sorted, that re-export is hoisted, this barrel requires the ESM package while Next is still import()-ing it, and `apps/web` dies on ERR_REQUIRE_ESM_RACE_CONDITION at page-data collection.

/**
 * The one door to MikroORM in this repository.
 *
 * What lives here is the ORM and nothing that has a rule of its own: the connection
 * ({@link postgresDatabase}), the module that assembles the entity list ({@link DatabaseModule}), how a
 * value object becomes a column ({@link valueObjectType}), how a path with no HTTP request gets a
 * context ({@link inRequestContext}) and what a driver exception means ({@link databaseErrorCode}).
 *
 * Whatever needs a domain to be understood stays in the module that owns that domain — which is why
 * soft delete's ORM half is still in `@nestposts/platform`, next to the rule it implements, and why
 * this package translates a foreign key violation into a **code** and lets the interface layer decide
 * what to say about it.
 */
export * from './config/index';
export * from './database.module';
export * from './entities/index';
export * from './filters/index';
export * from './helpers/index';
export * from './tenancy/index';
export * from '@mikro-orm/core';
export {
  CreateRequestContext,
  EnsureRequestContext,
  Transactional,
} from '@mikro-orm/decorators/legacy';
export {
  InjectEntityManager,
  InjectMikroORM,
  InjectMikroORMs,
  InjectRepository,
} from '@mikro-orm/nestjs';
