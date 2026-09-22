import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { type Accounts, Registrar } from './accounts';
import { Stack, WEB_URL } from './stack';

/**
 * **The stack, shared by the global setup, the global teardown and the specs.**
 *
 * Playwright runs both global hooks in the **main** process, so a module-level holder is what lets
 * the teardown stop the very processes the setup started — a second `Stack` would have no child
 * handles and would leave three servers running.
 *
 * The accounts cannot travel the same way: specs run in worker processes, which do not share this
 * module's memory. They go through a file, which is also the one thing worth looking at by hand when
 * a run fails.
 */
export class RunningStack {
  private static stack: Stack | undefined;

  private static readonly accountsFile = join(
    dirname(dirname(import.meta.dirname)),
    'target',
    'accounts.json',
  );

  static async up(): Promise<void> {
    const stack = new Stack();
    RunningStack.stack = stack;
    await stack.up();

    const accounts = await new Registrar(WEB_URL, stack.postsStore).register();
    mkdirSync(dirname(RunningStack.accountsFile), { recursive: true });
    writeFileSync(RunningStack.accountsFile, JSON.stringify(accounts, null, 2));
  }

  static async down(): Promise<void> {
    await RunningStack.stack?.down();
    RunningStack.stack = undefined;
  }

  /** What the global setup registered, read from a worker that never saw it. */
  static accounts(): Accounts {
    return JSON.parse(readFileSync(RunningStack.accountsFile, 'utf8')) as Accounts;
  }
}
