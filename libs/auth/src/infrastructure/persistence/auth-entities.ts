import type { EntitySchema } from '@nestposts/database';
import type { BetterAuthPlugin } from 'better-auth';

import type {
  BetterAuthPluginProvider,
  PluginDependencies,
} from '../better-auth/plugins/registry';
import { AuthConfiguration } from '../better-auth/config';
import { BetterAuthInstance } from '../better-auth/init-auth';
import { BetterAuthPlugins } from '../better-auth/plugins/registry';
import { BetterAuthSchema } from '../better-auth/schema';
import { BETTER_AUTH_CONFIG } from '../better-auth/tokens';
import { AuthUserEntitySchema } from './entities/auth-user-orm.entity';

/** The Better Auth model this package maps by hand. */
export const AUTH_USER_MODEL_KEY = 'user';

export interface BetterAuthEntityOptions {
  /** Plugin providers a module built on this one contributes — they may add tables and columns. */
  plugins?: readonly BetterAuthPluginProvider[];
  /** Models those modules map by hand, so they are generated here exactly once. */
  mapped?: readonly string[];
  /** What those plugin providers inject, for building them outside the container. */
  dependencies?: PluginDependencies;
}

/**
 * **Every table Better Auth owns here**, given the plugins this system runs.
 *
 * The plugins are an input and not a detail: `session` grows an `active_organization_id` the moment
 * the organization plugin is on, so a caller that generates this list without the plugins it actually
 * runs gets a schema that is quietly missing a column.
 */
export class BetterAuthEntities {
  static forPlugins({
    plugins = [],
    mapped = [],
    dependencies = [],
  }: BetterAuthEntityOptions = {}): EntitySchema[] {
    const config = AuthConfiguration.fromEnvironment();
    const built = BetterAuthPlugins.build(
      BetterAuthPlugins.providersWith(plugins),
      [[BETTER_AUTH_CONFIG, config], ...dependencies],
    );

    return [
      AuthUserEntitySchema,
      ...BetterAuthSchema.define(
        BetterAuthInstance.optionsFor(
          config,
          built as readonly BetterAuthPlugin[],
        ),
        [AUTH_USER_MODEL_KEY, ...mapped],
      ),
    ] as EntitySchema[];
  }
}

/** The tables of an authentication with no module built on top of it. */
export const authEntities = BetterAuthEntities.forPlugins();
