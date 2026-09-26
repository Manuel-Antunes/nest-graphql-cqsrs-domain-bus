import { test as base } from '@playwright/test';

import { RunEnvironment } from '../environment/run-environment';
import { SeededAccounts } from '../environment/seeded-accounts';
import type { Accounts } from '../model/account';

export interface EnvironmentFixtures {
  environment: RunEnvironment;
  accounts: Accounts;
}

export const test = base.extend<EnvironmentFixtures>({
  environment: async ({}, use) => {
    await use(new RunEnvironment());
  },

  accounts: async ({}, use) => {
    await use(SeededAccounts.read());
  },
});
