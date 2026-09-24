/// <reference path="../../../.sst/platform/config.d.ts" />

import { email } from '../mail';
import { vpc } from '../network';
import { bucket } from '../storage';
import type { LambdaPlatform } from '../support';
import { build } from './build';
import {
  links,
  migratorEnvironment,
  notificatorEnvironment,
  postsEnvironment,
  taggingEnvironment,
} from './environment';

/**
 * **The only place the two sides meet.** `support/` defines what a function is and knows nothing
 * about this system's resources; `network/`, `data/` and `messaging/` create those resources and
 * know nothing about who consumes them. This is the seam, and it is why it is a file of its own.
 */
const base = { vpc, link: links, dependsOn: [build] };

export const posts: LambdaPlatform = {
  ...base,
  link: [...links, bucket],
  environment: postsEnvironment,
};

export const tagging: LambdaPlatform = {
  ...base,
  environment: taggingEnvironment,
};

export const notificator: LambdaPlatform = {
  ...base,
  link: [...links, email],
  environment: notificatorEnvironment,
};

export const migrations: LambdaPlatform = {
  ...base,
  environment: migratorEnvironment,
};
