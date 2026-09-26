import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { Accounts } from '../model/account';
import { Workspace } from './workspace';

/**
 * The accounts the global setup registered, handed to the workers through a file: specs run in worker
 * processes, which do not share the setup's memory. It is also the one thing worth looking at by hand
 * when a run fails.
 */
export class SeededAccounts {
  private static readonly FILE = Workspace.path(
    'apps/web-e2e/target/accounts.json',
  );

  static write(accounts: Accounts): void {
    mkdirSync(dirname(SeededAccounts.FILE), { recursive: true });
    writeFileSync(SeededAccounts.FILE, JSON.stringify(accounts, null, 2));
  }

  static read(): Accounts {
    return JSON.parse(readFileSync(SeededAccounts.FILE, 'utf8')) as Accounts;
  }
}
