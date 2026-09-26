import { expect, test } from '../fixtures/test';

/**
 * **The admin plugin, through its screens: whoever holds `admin` manages users, nobody else does.**
 *
 * The page asks Better Auth's permission API, and the server is the boundary: a refused user gets
 * "Access denied" from the same endpoint a script would be refused by.
 */
test.describe('administration', () => {
  test('an administrator bans a user, and the ban holds at sign-in', async ({
    app,
    accounts,
    registration,
    authentication,
    visitors,
  }) => {
    const target = await registration.freshAccount('Troublemaker');
    await authentication.signIn(accounts.admin);

    await app.users.open();
    await app.users.ban(target, 'e2e');

    const banned = await visitors.arrive();
    await banned.authentication.attemptSignIn(target);
    await expect(banned.page).toHaveURL(/\/auth\/sign-in/);
    await expect(banned.app.header.accountButton).toHaveCount(0);
  });

  test('a user who is not an administrator is refused', async ({
    app,
    accounts,
    authentication,
  }) => {
    await authentication.signIn(accounts.reader);

    await app.users.open();

    await expect(app.users.accessDenied).toBeVisible();
  });
});
