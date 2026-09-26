import { expect, test } from '../fixtures/test';
import { EmailSender, EmailSubject } from '../model/email';
import { Unique } from '../support/unique';
import { Registration } from '../workflows/auth/registration.workflow';

/**
 * **Every email authentication sends is a notification, and every one of them arrives.**
 *
 * The browser drives better-auth-ui; `apps/web`'s Better Auth asks for an email; the web publishes a
 * `notifications.NotificationReceived` on this run's transport; the notificator renders the React
 * Email template and sends it; Mailpit receives it. Each test then does with the email what a person
 * would — follows the link, types the code — and the flow finishes in the browser.
 */
test.describe('the emails authentication sends', () => {
  test('signing up sends a verification link, and following it signs the person in', async ({
    page,
    app,
    mailbox,
    inbox,
  }) => {
    const email = Unique.email('newcomer');
    const before = await inbox.countFrom('web');

    await app.signUp.open();
    await app.signUp.submit({
      name: 'Newcomer',
      email,
      password: Registration.PASSWORD,
    });

    await expect(page).toHaveURL(/\/auth\/verify-email/);
    await expect(app.signUp.verificationNotice).toBeVisible();

    const mail = await mailbox.waitFor(email, EmailSubject.VERIFY_EMAIL);
    expect(mail.from).toBe(EmailSender.ADDRESS);
    expect(mail.html).toContain('Nest Posts');
    expect(
      await inbox.countFrom('web'),
      "the notificator recorded the web's notification in its inbox",
    ).toBeGreaterThan(before);

    await app.visit(mail.link('/api/auth/verify-email'));

    await expect(app.header.identity(email)).toBeVisible();
  });

  test('an unverified address is refused at sign-in, and is sent a fresh link', async ({
    app,
    mailbox,
    registration,
    authentication,
  }) => {
    const email = Unique.email('unverified');
    await registration.signUpUnverified(email, 'Unverified');
    const first = await mailbox.waitFor(email, EmailSubject.VERIFY_EMAIL);

    await authentication.attemptSignIn({
      email,
      password: Registration.PASSWORD,
    });

    const again = await mailbox.waitFor(email, EmailSubject.VERIFY_EMAIL, {
      after: new Set([first.id]),
    });
    expect(again.id).not.toBe(first.id);
    await expect(app.header.accountButton).toHaveCount(0);
  });

  test('a forgotten password is replaced through the emailed link', async ({
    app,
    registration,
    passwordRecovery,
    authentication,
  }) => {
    const account = await registration.freshAccount('Forgetful');

    await passwordRecovery.resetPassword(account.email, 'segredo456');
    await authentication.attemptSignIn({ ...account, password: 'segredo456' });

    await expect(app.header.identity(account.email)).toBeVisible();
  });

  test('a magic link signs in without a password', async ({
    page,
    app,
    registration,
    passwordless,
  }) => {
    const account = await registration.freshAccount('Linked');

    await passwordless.withMagicLink(account.email);

    await expect(page).toHaveURL(/\/feed/);
    await expect(app.header.identity(account.email)).toBeVisible();
  });

  test('an emailed code signs in without a password', async ({
    page,
    app,
    registration,
    passwordless,
  }) => {
    const account = await registration.freshAccount('Coded');

    await passwordless.withEmailedCode(account.email);

    await expect(page).toHaveURL(/\/feed/);
    await expect(app.header.identity(account.email)).toBeVisible();
  });

  test('an emailed code signs up an address nobody registered, and its profile is named after it', async ({
    page,
    app,
    passwordless,
  }) => {
    const email = Unique.email('stranger');
    const localPart = email.split('@')[0];

    await passwordless.withEmailedCode(email);
    await expect(page).toHaveURL(/\/feed/);

    await app.me.open();

    await expect(app.me.failure).toHaveCount(0);
    await expect(app.me.named(localPart)).toBeVisible();
  });

  test('two factor: the second step can be a code sent by email', async ({
    page,
    app,
    registration,
    authentication,
    twoFactor,
  }) => {
    const account = await registration.freshAccount('Guarded');
    await authentication.signIn(account);
    await twoFactor.enrollAuthenticator(account.password);
    await authentication.forgetSession();

    await authentication.attemptSignIn(account);
    await twoFactor.completeWithEmailedCode(account.email);

    await expect(page).toHaveURL(/\/feed/);
    await expect(app.header.identity(account.email)).toBeVisible();
  });

  test('a new email address is confirmed at the current one and verified at the new one', async ({
    registration,
    authentication,
    accountLifecycle,
    credentialRecords,
  }) => {
    const account = await registration.freshAccount('Moving');
    const newEmail = Unique.email('moved');
    await authentication.signIn(account);

    const confirmation = await accountLifecycle.requestEmailChange(
      account.email,
      newEmail,
    );
    expect(confirmation.html).toContain(newEmail);
    await accountLifecycle.confirmEmailChange(confirmation, newEmail);

    await expect
      .poll(() => credentialRecords.emailOf(account.credentialId))
      .toBe(newEmail);
  });

  test('deleting the account is confirmed by email before anything is removed', async ({
    registration,
    authentication,
    accountLifecycle,
    credentialRecords,
  }) => {
    const account = await registration.freshAccount('Leaving');
    await authentication.signIn(account);

    await accountLifecycle.requestDeletion();
    expect(await credentialRecords.exists(account.credentialId)).toBe(true);

    await accountLifecycle.confirmDeletion(account.email);

    await expect
      .poll(() => credentialRecords.exists(account.credentialId))
      .toBe(false);
  });
});
