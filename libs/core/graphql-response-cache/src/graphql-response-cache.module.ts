import { Module } from '@nestjs/common';

import { GraphQLResponseCache } from './graphql-response-cache';
import { GraphqlResponseCacheConfigurableModule } from './graphql-response-cache-module.options';

/**
 * Provides {@link GraphQLResponseCache}. Import it where the Yoga options are built —
 * `GraphQLModule.forRootAsync({ imports: [GraphQLResponseCacheModule], inject: [GraphQLResponseCache] })`
 * — and wherever something invalidates by hand. It needs the application's `CacheModule` to be global.
 */
@Module({
  providers: [GraphQLResponseCache],
  exports: [GraphQLResponseCache],
})
export class GraphQLResponseCacheModule extends GraphqlResponseCacheConfigurableModule {}
