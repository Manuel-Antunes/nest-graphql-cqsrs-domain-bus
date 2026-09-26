import { expect, test } from '../fixtures/test';
import { EmailSubject } from '../model/email';

/**
 * **An organization grows by invitation, and the invitation is an email.**
 *
 * The owner creates the organization and invites by address in better-auth-ui; the organization
 * plugin asks for the invitation email, which leaves the web as a notification and reaches Mailpit
 * through the notificator; the invitee follows the link, is asked to sign in first, and accepts.
 */
test.describe('organizations', () => {
  test('an owner invites by email, and the invitee joins through the link', async ({
    mailbox,
    registration,
    authentication,
    organizations,
    organizationRecords,
    visitors,
  }) => {
    const owner = await registration.freshAccount('Owner');
    const invitee = await registration.freshAccount('Invitee');
    const name = `Acme ${Date.now()}`;

    await authentication.signIn(owner);
    await organizations.create(name);
    await organizations.invite(invitee.email);

    const invitation = await mailbox.waitFor(
      invitee.email,
      EmailSubject.invitation(owner.name, name),
    );
    expect(invitation.html).toContain(name);

    const invited = await visitors.arrive();
    const acceptance = await invited.organizations.followInvitation(
      invitation,
      invitee,
    );
    await expect(acceptance.invitationTo(name)).toBeVisible();
    await acceptance.accept();

    await expect
      .poll(() => organizationRecords.rolesOf(name, invitee.credentialId))
      .toEqual(['member']);
  });
});
