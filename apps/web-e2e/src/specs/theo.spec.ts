import { expect, test } from '../fixtures/test';
import { TheoStandIn } from '../infrastructure/agents/theo-stand-in';

/**
 * **Theo, the AG-UI agent, through the web's chat.**
 *
 * The page is CopilotKit's headless hooks on this repository's own chat components; behind it the
 * web's `/api/copilotkit` runs the CopilotKit runtime, which calls the agent with an access token
 * the web's Better Auth issues for whoever is signed in. The agent here is a script
 * (`TheoStandIn`) that answers as the real one does when it hands a question to the posts agent
 * over A2A — so what is proved is the web's half: the conversation, the delegation shown inside it,
 * and a token that is the person's, for the agents' audiences, signed by the web.
 */
test.describe('talking to Theo', () => {
  test('a signed-in person asks Theo, sees the posts agent answer inside the delegation, and Theo is called with a token of theirs', async ({
    app,
    registration,
    authentication,
    theoRecords,
  }) => {
    const reader = await registration.freshAccount('Theo');
    const question = `Who am I? ${Date.now()}`;

    await authentication.signIn(reader);
    await app.theo.open();
    await app.theo.ask(question);

    await expect(app.theo.said(question)).toBeVisible();
    const delegation = app.theo.delegationTo(TheoStandIn.DELEGATE);
    await expect(delegation).toBeVisible();
    await expect(
      delegation.getByText(TheoStandIn.delegateSays(reader.credentialId)),
    ).toBeVisible();
    await expect(delegation.getByText('answered')).toBeVisible();
    await expect(app.theo.said(TheoStandIn.answerTo(question))).toBeVisible();

    const invocation = await theoRecords.lastAsking(question);
    expect(invocation).toMatchObject({
      signedByTheWeb: true,
      claims: {
        sub: reader.credentialId,
        aud: TheoStandIn.AUDIENCES,
      },
    });
    expect(String(invocation?.claims.scope).split(' ')).toEqual(
      expect.arrayContaining(['read:posts', 'write:posts']),
    );
    expect(invocation?.session).toBe(invocation?.threadId);
  });

  test('a visitor who is not signed in is asked to sign in, and the runtime refuses them', async ({
    app,
  }) => {
    await app.theo.open();

    await expect(app.theo.signInPrompt).toBeVisible();
    expect(await app.theo.runStatusWithoutConversation()).toBe(401);
  });
});
