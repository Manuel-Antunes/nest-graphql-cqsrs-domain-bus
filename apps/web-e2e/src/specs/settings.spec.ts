import {
  expect,
  openAuthView,
  signInThroughTheForm,
  test,
} from '../fixtures/test';

/**
 * **The security settings list every session, including one no browser opened.**
 *
 * A session Better Auth creates on the server's own behalf — the seeder signing a user in, a
 * script — records no user agent. The list parsed it regardless, and on AWS the whole page failed to
 * load for anyone holding one.
 */
test.describe('security settings', () => {
  test('a session with no user agent is listed as an unknown browser', async ({
    page,
    freshAccount,
    postsStore,
  }) => {
    const account = await freshAccount('Scripted');
    await signInThroughTheForm(page, account);
    await expect(page.getByText(account.email).first()).toBeVisible();
    await postsStore.query(
      `update session set user_agent = '' where user_id = ?`,
      account.credentialId,
    );

    await openAuthView(page, '/settings/security');

    await expect(page.getByText('Unknown Browser').first()).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Delete account' }),
    ).toBeVisible();
  });
});
