/// <reference path="../../../.sst/platform/config.d.ts" />

import type { LambdaPlatform } from '../support';
import { vpc } from '../network';
import { build } from './build';
import {
  links,
  migratorEnvironment,
  postsEnvironment,
  taggingEnvironment,
} from './environment';

/**
 * **The only place the two sides meet.** `support/` defines what a function is and knows nothing
 * about this system's resources; `network/`, `data/` and `messaging/` create those resources and
 * know nothing about who consumes them. This is the seam, and it is why it is a file of its own.
 */
const base = { vpc, link: links, dependsOn: [build] };

export const posts: LambdaPlatform = { ...base, environment: postsEnvironment };

export const tagging: LambdaPlatform = {
  ...base,
  environment: taggingEnvironment,
};

export const migrations: LambdaPlatform = {
  ...base,
  environment: migratorEnvironment,
};
