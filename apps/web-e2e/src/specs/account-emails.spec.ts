import {
  expect,
  openAuthView,
  signInThroughTheForm,
  test,
} from '../fixtures/test';
import { Registrar, VERIFY_EMAIL_SUBJECT } from '../support/accounts';
import { codeIn, linkIn } from '../support/mailbox';
import { WEB_URL } from '../support/stack';
import { totpNow } from '../support/totp';

const fresh = (name: string) =>
  `${name}-${Date.now()}-${Math.round(Math.random() * 1e6)}@example.com`;

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
    mailbox,
    postsStore,
  }) => {
    const email = fresh('newcomer');
    const publishedByTheWeb = async () =>
      (
        await postsStore.query<{ total: number }>(
          "select count(*) as total from transport_message_inbox where origin = 'web'",
        )
      )[0]?.total ?? 0;
    const before = await publishedByTheWeb();

    await openAuthView(page, '/auth/sign-up');
    await page.getByRole('textbox', { name: 'Name' }).fill('Newcomer');
    await page.getByRole('textbox', { name: 'Email' }).fill(email);
    await page
      .getByRole('textbox', { name: 'Password', exact: true })
      .fill(Registrar.PASSWORD);
    await page.getByRole('button', { name: 'Sign Up' }).click();

    await expect(page).toHaveURL(/\/auth\/verify-email/);
    await expect(
      page.getByText('Check your email for a verification link'),
    ).toBeVisible();

    const mail = await mailbox.waitFor(email, VERIFY_EMAIL_SUBJECT);
    expect(mail.from).toBe('no-reply@nestposts.test');
    expect(mail.html).toContain('Nest Posts');
    expect(
      await publishedByTheWeb(),
      "the notificator recorded the web's notification in its inbox",
    ).toBeGreaterThan(before);

    await page.goto(linkIn(mail, '/api/auth/verify-email'));

    await expect(page.getByText(email).first()).toBeVisible();
  });

  test('an unverified address is refused at sign-in, and is sent a fresh link', async ({
    page,
    mailbox,
  }) => {
    const email = fresh('unverified');
    const signedUp = await fetch(`${WEB_URL}/api/auth/sign-up/email`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'origin': WEB_URL },
      body: JSON.stringify({
        email,
        name: 'Unverified',
        password: Registrar.PASSWORD,
      }),
    });
    expect(signedUp.ok).toBe(true);
    const first = await mailbox.waitFor(email, VERIFY_EMAIL_SUBJECT);

    await signInThroughTheForm(page, {
      email,
      password: Registrar.PASSWORD,
    });

    const again = await mailbox.waitFor(email, VERIFY_EMAIL_SUBJECT, {
      after: new Set([first.id]),
    });
    expect(again.id).not.toBe(first.id);
    await expect(page.getByRole('button', { name: 'Account' })).toHaveCount(0);
  });

  test('a forgotten password is replaced through the emailed link', async ({
    page,
    mailbox,
    freshAccount,
  }) => {
    const account = await freshAccount('Forgetful');

    await openAuthView(page, '/auth/forgot-password');
    await page.getByRole('textbox', { name: 'Email' }).fill(account.email);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page).toHaveURL(/\/auth\/reset-link-sent/);

    const mail = await mailbox.waitFor(account.email, 'Reset your password');
    await page.goto(linkIn(mail, '/api/auth/reset-password/'));
    await expect(page).toHaveURL(/\/auth\/reset-password\?token=/);
    await page.getByRole('textbox', { name: 'Password' }).fill('segredo456');
    await page.getByRole('button', { name: 'Reset Password' }).click();
    await expect(page).toHaveURL(/\/auth\/sign-in/);

    await signInThroughTheForm(page, { ...account, password: 'segredo456' });
    await expect(page.getByText(account.email).first()).toBeVisible();
  });

  test('a magic link signs in without a password', async ({
    page,
    mailbox,
    freshAccount,
  }) => {
    const account = await freshAccount('Linked');

    await openAuthView(page, '/auth/magic-link');
    await page.getByRole('textbox', { name: 'Email' }).fill(account.email);
    await page.getByRole('button', { name: 'Send Magic Link' }).click();
    await expect(page).toHaveURL(/\/auth\/magic-link-sent/);

    const mail = await mailbox.waitFor(account.email, 'Sign in to Nest Posts');
    await page.goto(linkIn(mail, '/api/auth/magic-link/verify'));

    await expect(page).toHaveURL(/\/feed/);
    await expect(page.getByText(account.email).first()).toBeVisible();
  });

  test('an emailed code signs in without a password', async ({
    page,
    mailbox,
    freshAccount,
  }) => {
    const account = await freshAccount('Coded');

    await openAuthView(page, '/auth/email-otp');
    await page.getByRole('textbox', { name: 'Email' }).fill(account.email);
    await page.getByRole('button', { name: 'Send code' }).click();

    const mail = await mailbox.waitFor(account.email, 'Your sign-in code');
    await page.getByRole('textbox', { name: 'Code' }).fill(codeIn(mail));

    await expect(page).toHaveURL(/\/feed/);
    await expect(page.getByText(account.email).first()).toBeVisible();
  });

  test('an emailed code signs up an address nobody registered, and its profile is named after it', async ({
    page,
    mailbox,
  }) => {
    const email = fresh('stranger');
    const localPart = email.split('@')[0];

    await openAuthView(page, '/auth/email-otp');
    await page.getByRole('textbox', { name: 'Email' }).fill(email);
    await page.getByRole('button', { name: 'Send code' }).click();
    const mail = await mailbox.waitFor(email, 'Your sign-in code');
    await page.getByRole('textbox', { name: 'Code' }).fill(codeIn(mail));
    await expect(page).toHaveURL(/\/feed/);

    await page.goto('/me');

    await expect(page.getByText('me falhou')).toHaveCount(0);
    await expect(
      page.getByText(localPart, { exact: true }).first(),
    ).toBeVisible();
  });

  test('two factor: the second step can be a code sent by email', async ({
    page,
    mailbox,
    freshAccount,
  }) => {
    const account = await freshAccount('Guarded');
    await signInThroughTheForm(page, account);
    await expect(page.getByText(account.email).first()).toBeVisible();

    const enabled = await page.request.post('/api/auth/two-factor/enable', {
      headers: { origin: WEB_URL },
      data: { password: account.password },
    });
    const { totpURI } = (await enabled.json()) as { totpURI: string };
    const secret = new URL(totpURI).searchParams.get('secret') as string;
    const enrolled = await page.request.post(
      '/api/auth/two-factor/verify-totp',
      { headers: { origin: WEB_URL }, data: { code: totpNow(secret) } },
    );
    expect(enrolled.ok(), await enrolled.text()).toBe(true);
    await page.context().clearCookies();

    await signInThroughTheForm(page, account);
    await expect(page).toHaveURL(/\/auth\/two-factor/);
    await page.getByRole('button', { name: 'Use an emailed code' }).click();
    await page.getByRole('button', { name: 'Email me a code' }).click();

    const mail = await mailbox.waitFor(account.email, 'Your two-factor code');
    await page
      .getByRole('textbox', { name: 'Emailed code' })
      .fill(codeIn(mail));

    await expect(page).toHaveURL(/\/feed/);
    await expect(page.getByText(account.email).first()).toBeVisible();
  });

  test('a new email address is confirmed at the current one and verified at the new one', async ({
    page,
    mailbox,
    freshAccount,
    postsStore,
  }) => {
    const account = await freshAccount('Moving');
    const newEmail = fresh('moved');
    await signInThroughTheForm(page, account);
    await expect(page.getByText(account.email).first()).toBeVisible();

    await openAuthView(page, '/settings/account');
    await page.getByRole('textbox', { name: 'Email' }).fill(newEmail);
    await page.getByRole('button', { name: 'Update email' }).click();
    await expect(
      page.getByText('Check your email to confirm the change'),
    ).toBeVisible();

    const confirmation = await mailbox.waitFor(
      account.email,
      'Confirm your email change',
    );
    expect(confirmation.html).toContain(newEmail);
    await page.goto(linkIn(confirmation, '/api/auth/verify-email'));

    const verification = await mailbox.waitFor(newEmail, VERIFY_EMAIL_SUBJECT);
    await page.goto(linkIn(verification, '/api/auth/verify-email'));

    await expect
      .poll(
        async () =>
          (
            await postsStore.query<{ email: string }>(
              'select email from auth_user where id = ?',
              account.credentialId,
            )
          )[0]?.email,
      )
      .toBe(newEmail);
  });

  test('deleting the account is confirmed by email before anything is removed', async ({
    page,
    mailbox,
    freshAccount,
    postsStore,
  }) => {
    const account = await freshAccount('Leaving');
    const credentials = () =>
      postsStore.query(
        'select id from auth_user where id = ?',
        account.credentialId,
      );
    await signInThroughTheForm(page, account);
    await expect(page.getByText(account.email).first()).toBeVisible();

    await openAuthView(page, '/settings/security');
    await page.getByRole('button', { name: 'Delete account' }).click();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Delete account' })
      .click();
    await expect(
      page.getByText('Check your email to confirm account deletion.'),
    ).toBeVisible();
    expect(await credentials()).toHaveLength(1);

    const mail = await mailbox.waitFor(
      account.email,
      'Confirm the deletion of your account',
    );
    await page.goto(linkIn(mail, '/api/auth/delete-user/callback'));

    await expect.poll(async () => (await credentials()).length).toBe(0);
  });
});
