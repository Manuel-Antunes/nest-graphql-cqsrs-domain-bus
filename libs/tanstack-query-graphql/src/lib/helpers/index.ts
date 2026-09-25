export type { Reference, StoreObject } from '@apollo/client';
/**
 * Re-exported so consumers can write `updateCache` recipes without taking a
 * direct dependency on `@apollo/client`. `apps/web` does not declare one — the
 * Apollo surface it uses arrives entirely through this lib.
 *
 * `gql` is needed for `cache.writeFragment` / `cache.readFragment`; `Reference`
 * and `StoreObject` type the callbacks passed to `cache.modify`.
 */
export {
  ApolloCache as GraphCache,
  gql,
  InMemoryCache as InMemoryGraphCache,
} from '@apollo/client';
