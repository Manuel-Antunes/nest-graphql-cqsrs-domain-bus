import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseEnv } from 'node:util';

import { WORKSPACE_ROOT } from './docker';

/**
 * **The suite's own secrets**: `E2E_<NAME>` from the environment, or `<NAME>` from the repository's
 * `.env.test`.
 *
 * Never a bare `<NAME>` from the environment, and that is the whole reason this exists: `nx` loads the
 * root `.env` into every target it runs, and that file holds the values a DEPLOY uses — a production
 * Polar token among them. A suite that read `POLAR_ACCESS_TOKEN` would create products and webhooks
 * wherever that token points.
 */
export class TestEnvironment {
  private static file?: Record<string, string | undefined>;

  static read(name: string): string | undefined {
    return (
      process.env[`E2E_${name}`] ||
      TestEnvironment.fromFile()[name] ||
      undefined
    );
  }

  private static fromFile(): Record<string, string | undefined> {
    if (!TestEnvironment.file) {
      const path = join(WORKSPACE_ROOT, '.env.test');
      TestEnvironment.file = existsSync(path)
        ? parseEnv(readFileSync(path, 'utf8'))
        : {};
    }
    return TestEnvironment.file;
  }
}
