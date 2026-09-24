import {
  expect,
  openAuthView,
  signInThroughTheForm,
  test,
} from '../fixtures/test';
import { linkIn } from '../support/mailbox';

/**
 * **An organization grows by invitation, and the invitation is an email.**
 *
 * The owner creates the organization and invites by address in better-auth-ui; the organization
 * plugin asks for the invitation email, which leaves the web as a notification and reaches Mailpit
 * through the notificator; the invitee follows the link, is asked to sign in first, and accepts.
 */
test.describe('organizations', () => {
  test('an owner invites by email, and the invitee joins through the link', async ({
    browser,
    page,
    mailbox,
    freshAccount,
    postsStore,
  }) => {
    const owner = await freshAccount('Owner');
    const invitee = await freshAccount('Invitee');
    const name = `Acme ${Date.now()}`;

    await signInThroughTheForm(page, owner);
    await expect(page.getByText(owner.email).first()).toBeVisible();
    await openAuthView(page, '/settings/organizations');
    await page
      .getByRole('button', { name: 'Create organization' })
      .first()
      .click();
    const create = page.getByRole('dialog', { name: 'Create organization' });
    await create.getByRole('textbox', { name: 'Name' }).fill(name);
    await create.getByRole('button', { name: 'Create organization' }).click();
    await expect(page.getByText(name).first()).toBeVisible();

    await page.getByRole('button', { name: 'Manage' }).click();
    await expect(page).toHaveURL(/\/organization\/settings/);
    await openAuthView(page, '/organization/people');
    await page.getByRole('button', { name: 'Invite member' }).first().click();
    const invite = page.getByRole('dialog', { name: 'Invite member' });
    await invite.getByRole('textbox', { name: 'Email' }).fill(invitee.email);
    await invite.getByRole('button', { name: 'Invite member' }).click();

    const mail = await mailbox.waitFor(
      invitee.email,
      `${owner.name} invited you to ${name}`,
    );
    expect(mail.html).toContain(name);

    const context = await browser.newContext();
    const invited = await context.newPage();
    await invited.goto(linkIn(mail, '/auth/accept-invitation'));
    await expect(invited).toHaveURL(/\/auth\/sign-in\?redirectTo=/);
    await invited.waitForLoadState('networkidle');
    await invited.getByRole('textbox', { name: 'Email' }).fill(invitee.email);
    await invited
      .getByRole('textbox', { name: 'Password' })
      .fill(invitee.password);
    await invited.getByRole('button', { name: 'Sign In' }).click();

    await expect(invited).toHaveURL(/\/auth\/accept-invitation/);
    await expect(
      invited.getByText(`You've been invited to join ${name} as Member.`),
    ).toBeVisible();
    await invited.getByRole('button', { name: 'Accept' }).click();

    await expect
      .poll(async () =>
        (
          await postsStore.query<{ role: string }>(
            `select m.role from member m
               join organization o on o.id = m.organization_id
              where o.name = ? and m.user_id = ?`,
            name,
            invitee.credentialId,
          )
        ).map((row) => row.role),
      )
      .toEqual(['member']);
    await context.close();
  });
});
