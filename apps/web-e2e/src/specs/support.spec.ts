import { expect, test } from '../fixtures/test';
import { ChatwootApi } from '../infrastructure/chatwoot/chatwoot-api';
import { DashboardToken } from '../infrastructure/chatwoot/dashboard-token';
import {
  ChatwootIdentity,
  SetTeamHours,
  SupportIdentity,
  TeamHours,
} from '../infrastructure/graphql/operations/support.operations';
import { Unique } from '../support/unique';

/**
 * **Chatwoot is part of the platform, and answers to its session.**
 *
 * The platform's triggers mirror every user, organization, member and team into Chatwoot; Chatwoot
 * keeps no sign-in of its own and authenticates every request with the platform's Better Auth
 * session — the signed cookie in a browser, the same cookie forwarded by the gateway — in the account
 * of the organization the request names. The Support tab embeds its dashboard.
 *
 * The first test to open the dashboard pays for Vite compiling it, hence the generous waits on the
 * frame.
 */
const DASHBOARD = { timeout: 120_000 };

test.describe('Chatwoot, under the platform session', () => {
  test.describe.configure({ timeout: 240_000 });

  test('signing up makes an agent, an organization an account and its owner an administrator, and Support opens Chatwoot signed in there', async ({
    app,
    graphql,
    registration,
    authentication,
    organizations,
    chatwootRecords,
  }) => {
    const owner = await registration.freshAccount('Support');
    const organization = `Support ${Unique.suffix()}`;

    await authentication.signIn(owner);
    await organizations.create(organization);

    expect(await chatwootRecords.agentOf(owner.email)).toEqual({
      name: owner.name,
      email: owner.email.toLowerCase(),
      type: null,
    });
    const account = await chatwootRecords.accountOf(organization);
    expect(account?.status, 'an active account').toBe(0);
    expect(await chatwootRecords.seatOf(organization, owner.email)).toBe(
      'administrator',
    );

    const { currentAgent, currentAccount } =
      await graphql.data(SupportIdentity);
    expect(currentAccount).toEqual({
      id: String(account?.id),
      name: organization,
    });
    expect(
      currentAgent?.user,
      'the agent is the platform user, resolved through the posts subgraph',
    ).toEqual({
      __typename: 'User',
      id: owner.credentialId,
      email: owner.email,
    });

    await app.support.open();
    await expect
      .poll(() => app.support.framedPath(), DASHBOARD)
      .toMatch(new RegExp(`^/app/accounts/${account?.id}/`));
    await expect(
      app.support.frame.locator('input[type="password"]'),
      'no Chatwoot sign-in in the way',
    ).toHaveCount(0);
    await expect(
      app.page,
      "the web's address follows the dashboard's",
    ).toHaveURL(
      new RegExp(`/atendimento/app/accounts/${account?.id}/`),
      DASHBOARD,
    );
  });

  test('Chatwoot has no sign-in of its own: its password form is refused, and its dashboard sends a stranger to the platform', async ({
    accounts,
    environment,
    chatwoot,
    visitors,
  }) => {
    expect(await chatwoot.passwordSignIn(accounts.reader)).toBe(403);
    expect(await chatwoot.dashboardRedirect()).toBe(
      `${environment.webUrl}/auth/sign-in`,
    );

    const stranger = await visitors.arrive();
    await stranger.app.support.open();
    await expect(stranger.app.support.signInPrompt).toBeVisible();
    await expect(stranger.app.support.dashboard).toHaveCount(0);
  });

  test('the platform session is the only credential: a forged cookie is nobody, and the dashboard token dies with the session', async ({
    app,
    registration,
    authentication,
    organizations,
    chatwoot,
  }) => {
    const agent = await registration.freshAccount('Token');
    await authentication.signIn(agent);
    await organizations.create(`Token ${Unique.suffix()}`);
    await app.support.open();
    await expect
      .poll(() => app.support.framedPath(), DASHBOARD)
      .toMatch(/^\/app\/accounts\/\d+\//);

    const session = await app.cookie(ChatwootApi.SESSION_COOKIE);
    const minted = await app.cookie(DashboardToken.COOKIE);
    expect(session, 'the platform session cookie').toBeTruthy();
    expect(minted, 'the dashboard token Chatwoot minted for it').toBeTruthy();
    const token = DashboardToken.fromCookie(minted ?? '');
    expect(token.uid).toBe(agent.email.toLowerCase());

    const identity = await chatwoot
      .graphql(session ?? '')
      .data(ChatwootIdentity);
    expect(identity.currentAgent?.email).toBe(agent.email.toLowerCase());

    const [sessionToken] = decodeURIComponent(session ?? '').split('.');
    const forged = await chatwoot
      .graphql(`${sessionToken}.${'A'.repeat(43)}=`)
      .execute(ChatwootIdentity);
    expect(forged.data?.currentAgent ?? null).toBeNull();
    expect(forged.errors?.[0]?.message).toBe('Unauthenticated.');

    expect(await chatwoot.profileStatus(token, session)).toBe(200);
    expect(
      await chatwoot.profileStatus(token),
      'the dashboard token alone, without the platform session beside it',
    ).toBe(401);

    await app.header.signOut();
    expect(
      await chatwoot.profileStatus(token, session),
      'the same token and cookie once the platform session has ended',
    ).toBe(401);
  });

  test('Chatwoot answers in the account of the organization the request names, and in no other', async ({
    app,
    graphql,
    accounts,
    registration,
    authentication,
    organizations,
    organizationRecords,
    chatwootRecords,
    visitors,
  }) => {
    const owner = await registration.freshAccount('Accounts');
    const suffix = Unique.suffix();
    const acme = `Acme ${suffix}`;
    const globex = `Globex ${suffix}`;

    await authentication.signIn(owner);
    await organizations.create(acme);
    await organizations.create(globex);

    expect((await graphql.data(SupportIdentity)).currentAccount?.name).toBe(
      globex,
    );

    await organizations.switchBetween(globex, acme);
    await expect
      .poll(
        async () => (await graphql.data(SupportIdentity)).currentAccount?.name,
      )
      .toBe(acme);

    const acmeAccount = await chatwootRecords.accountOf(acme);
    await app.support.open();
    await expect
      .poll(() => app.support.framedPath(), DASHBOARD)
      .toMatch(new RegExp(`^/app/accounts/${acmeAccount?.id}/`));

    const stranger = await visitors.arrive({
      extraHTTPHeaders: { 'x-tenant': await organizationRecords.slugOf(acme) },
    });
    await stranger.authentication.signIn(accounts.reader);
    const refused = await stranger.graphql.execute(SupportIdentity);
    expect(refused.data?.currentAccount ?? null).toBeNull();
    expect(refused.errors?.map((error) => error.message)).toContain(
      'No active account for the current user.',
    );
  });

  test("a team keeps its business hours in Chatwoot, and the platform's team shows them", async ({
    graphql,
    registration,
    authentication,
    organizations,
    chatwootRecords,
  }) => {
    const owner = await registration.freshAccount('Hours');
    const team = `Front Desk ${Unique.suffix()}`;
    await authentication.signIn(owner);
    await organizations.create(`Hours ${Unique.suffix()}`);
    const teamId = await organizations.createTeam(team);

    expect(await chatwootRecords.teamOf(team)).toBe(team.toLowerCase());

    await graphql.data(SetTeamHours, {
      input: {
        teamId,
        days: [
          {
            dayOfWeek: 1,
            openHour: 9,
            openMinutes: 0,
            closeHour: 18,
            closeMinutes: 0,
          },
        ],
      },
    });

    const { teams } = await graphql.data(TeamHours);
    expect(teams.find((candidate) => candidate.id === teamId)).toEqual({
      id: teamId,
      name: team,
      supportTeam: { name: team.toLowerCase() },
      workingHours: { nodes: [{ dayOfWeek: 1, openHour: 9, closeHour: 18 }] },
    });
  });
});
