import { expect, test } from '../fixtures/test';

/**
 * **The security settings list every session, including one no browser opened.**
 *
 * A session Better Auth creates on the server's own behalf — the seeder signing a user in, a
 * script — records no user agent. The list parsed it regardless, and on AWS the whole page failed to
 * load for anyone holding one.
 */
test.describe('security settings', () => {
  test('a session with no user agent is listed as an unknown browser', async ({
    app,
    registration,
    authentication,
    credentialRecords,
  }) => {
    const account = await registration.freshAccount('Scripted');
    await authentication.signIn(account);
    await credentialRecords.forgetUserAgentsOf(account.credentialId);

    await app.securitySettings.open();

    await expect(app.securitySettings.unknownBrowser).toBeVisible();
    await expect(app.securitySettings.deleteAccountButton).toBeVisible();
  });
});
