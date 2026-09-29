import { SeededAccounts } from '../environment/seeded-accounts';
import { AuthApi } from '../infrastructure/auth/auth-api';
import { CredentialRecords } from '../infrastructure/database/credential-records';
import { Database } from '../infrastructure/database/database';
import { SessionCache } from '../infrastructure/database/session-cache';
import { Mailbox } from '../infrastructure/mail/mailbox';
import { Registration } from '../workflows/auth/registration.workflow';
import { Stack } from './stack';

/**
 * **The stack, shared by the global setup and the global teardown.**
 *
 * Playwright runs both global hooks in the **main** process, so a module-level holder is what lets
 * the teardown stop the very processes the setup started — a second `Stack` would have no child
 * handles and would leave three servers running.
 */
export class RunningStack {
  private static stack: Stack | undefined;

  static async up(): Promise<void> {
    const stack = new Stack();
    RunningStack.stack = stack;
    await stack.up();

    const { environment } = stack;
    const registration = new Registration(
      new AuthApi(environment.webUrl),
      new Mailbox(environment.mailboxUrl),
      new CredentialRecords(
        Database.ofTenant(environment.postgresUrl),
        new SessionCache(environment.redisUrl),
      ),
    );
    SeededAccounts.write(await registration.seed());
  }

  static async down(): Promise<void> {
    await RunningStack.stack?.down();
    RunningStack.stack = undefined;
  }
}
