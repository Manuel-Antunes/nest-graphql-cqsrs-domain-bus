import type { FactoryProvider } from '@nestjs/common';
import type { BetterAuthPlugin } from 'better-auth';

import type { BetterAuthPluginProvider } from '../plugins/registry';
import { BETTER_AUTH_PLUGINS } from '../tokens';

/**
 * Folds the registered plugin providers back into the single ordered array `initAuth` consumes.
 *
 * Nest resolves `inject` in order and passes the results positionally, so the array this returns
 * lines up 1:1 with the providers it was built from — which is what makes the plugin order the
 * registration order, and nothing to keep in step by hand.
 */
export const BetterAuthPluginsFactory = (
  providers: readonly BetterAuthPluginProvider[],
): FactoryProvider => ({
  provide: BETTER_AUTH_PLUGINS,
  useFactory: (...plugins: BetterAuthPlugin[]) => plugins,
  inject: providers.map((provider) => provider.provide as string),
});
