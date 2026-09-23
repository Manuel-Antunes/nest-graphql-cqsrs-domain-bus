import { AdminBetterAuthPluginProvider } from './admin-better-auth.plugin';
import { JwtBetterAuthPluginProvider } from './jwt-better-auth.plugin';
import { OAuthProviderBetterAuthPluginProvider } from './oauth-provider-better-auth.plugin';
import { OpenApiBetterAuthPluginProvider } from './open-api-better-auth.plugin';

export const coreBetterAuthPluginProviders = [
  AdminBetterAuthPluginProvider,
  JwtBetterAuthPluginProvider,
  OAuthProviderBetterAuthPluginProvider,
  OpenApiBetterAuthPluginProvider,
] as const;

type PluginOf<TProvider> = TProvider extends {
  useFactory: (...args: any[]) => infer TPlugin;
}
  ? TPlugin
  : never;

export type PluginsOf<TProviders extends readonly unknown[]> = {
  -readonly [K in keyof TProviders]: PluginOf<TProviders[K]>;
};

export type BetterAuthCorePlugins = PluginsOf<
  typeof coreBetterAuthPluginProviders
>;

export type BetterAuthPluginsWith<TExtra extends readonly unknown[]> = [
  ...PluginsOf<TExtra>,
  ...BetterAuthCorePlugins,
];

/**
 * What a plugin provider looks like, loosely enough for a plugin whose own type does not satisfy
 * `BetterAuthPlugin` (see `@better-auth/oauth-provider` in its provider) while still being a valid
 * Nest provider. The exact plugin types are recovered by {@link PluginsOf}, which is where they
 * matter.
 */
export interface BetterAuthPluginProvider {
  provide: string;
  useFactory: (...args: any[]) => any;
  inject?: any[];
}

export type PluginDependencies = Iterable<readonly [unknown, unknown]>;

export class BetterAuthPlugins {
  /**
   * The providers a runtime registers: whatever a module built on this one contributes, then the
   * core ones.
   *
   * The contributed ones come FIRST because `@better-auth/oauth-provider` resolves the jwt plugin
   * from context. `trailing` is what goes AFTER the core, and it is there for one reason: Better Auth
   * requires cookie plugins last, which is where `nextCookies()` has to sit.
   *
   * Both are `const` generics, so the result stays an exact TUPLE. Typing `trailing` as a plain
   * array instead would widen the whole return and collapse the inference every `auth.api.*` call
   * depends on — quietly, since the calls keep compiling as `any`.
   */
  static providersWith<
    const TExtra extends readonly BetterAuthPluginProvider[] = [],
    const TTrailing extends readonly BetterAuthPluginProvider[] = [],
  >(
    extra: TExtra = [] as unknown as TExtra,
    trailing: TTrailing = [] as unknown as TTrailing,
  ): [...TExtra, ...typeof coreBetterAuthPluginProviders, ...TTrailing] {
    return [...extra, ...coreBetterAuthPluginProviders, ...trailing];
  }

  /**
   * Instantiates those providers **outside** Nest, resolving each one's `inject` tokens against a
   * small map. It is what lets a runtime with no container — the Next server, the migrator — share
   * this one registry instead of keeping a second plugin list in step with it.
   *
   * It throws for a token it does not know rather than skipping it: a plugin silently built without
   * its dependency is a plugin that works until the one request that needs it.
   */
  static build<TProviders extends readonly BetterAuthPluginProvider[]>(
    providers: TProviders,
    dependencies: PluginDependencies,
  ): PluginsOf<TProviders> {
    const resolved = new Map<unknown, unknown>(dependencies);

    return providers.map((provider) => {
      const args = (provider.inject ?? []).map((token) => {
        if (!resolved.has(token)) {
          throw new Error(
            `no standalone value registered for the better-auth plugin dependency ${String(token)}`,
          );
        }
        return resolved.get(token);
      });
      return provider.useFactory(...args);
    }) as PluginsOf<TProviders>;
  }
}
