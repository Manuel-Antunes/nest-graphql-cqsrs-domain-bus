import {
  expect,
  openAuthView,
  signInThroughTheForm,
  test,
} from '../fixtures/test';

/**
 * **The admin plugin, through its screens: whoever holds `admin` manages users, nobody else does.**
 *
 * The page asks Better Auth's permission API, and the server is the boundary: a refused user gets
 * "Access denied" from the same endpoint a script would be refused by.
 */
test.describe('administration', () => {
  test('an administrator bans a user, and the ban holds at sign-in', async ({
    browser,
    page,
    accounts,
    signIn,
    freshAccount,
  }) => {
    const target = await freshAccount('Troublemaker');
    await signIn(accounts.admin);

    await openAuthView(page, '/admin/users');
    await page.getByRole('button', { name: target.name }).first().click();
    const drawer = page.getByRole('dialog', { name: target.name });
    await expect(drawer.getByText(target.email)).toBeVisible();
    await drawer.getByRole('button', { name: 'Ban user' }).click();
    const ban = page.getByRole('alertdialog', { name: 'Ban user' });
    await ban.getByRole('textbox', { name: 'Ban reason' }).fill('e2e');
    await ban.getByRole('button', { name: 'Ban user' }).click();
    await expect(ban).toHaveCount(0);

    const context = await browser.newContext();
    const banned = await context.newPage();
    await signInThroughTheForm(banned, target);
    await expect(banned).toHaveURL(/\/auth\/sign-in/);
    await expect(banned.getByRole('button', { name: 'Account' })).toHaveCount(
      0,
    );
    await context.close();
  });

  test('a user who is not an administrator is refused', async ({
    page,
    accounts,
    signIn,
  }) => {
    await signIn(accounts.reader);

    await page.goto('/admin/users');

    await expect(
      page.getByRole('heading', { name: 'Access denied' }),
    ).toBeVisible();
  });
});
