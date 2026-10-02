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
        aud: expect.arrayContaining(TheoStandIn.AUDIENCES),
      },
    });
    expect(String(invocation?.claims.scope).split(' ')).toEqual(
      expect.arrayContaining([
        'read:posts',
        'write:posts',
        'read:chats',
        'write:chats',
      ]),
    );
    expect(invocation?.session).toBe(invocation?.threadId);
  });

  test('a person finds their conversations listed by the chat API, picks one up on its own thread, and nobody else sees it', async ({
    app,
    registration,
    authentication,
    theoRecords,
    visitors,
  }) => {
    const person = await registration.freshAccount('Theo history');
    const first = `What did I write last week? ${Date.now()}`;
    const second = `Something else entirely ${Date.now()}`;

    await authentication.signIn(person);
    await app.theo.open();
    await expect(app.theo.noConversationYet).toBeVisible();
    await app.theo.ask(first);
    await expect(app.theo.said(TheoStandIn.answerTo(first))).toBeVisible();
    await expect(app.theo.conversationTitles).toHaveText([first]);
    await app.theo.startNewConversation();
    await expect(app.theo.said(first)).toBeHidden();
    await app.theo.ask(second);
    await expect(app.theo.said(TheoStandIn.answerTo(second))).toBeVisible();
    await expect(app.theo.conversationTitles).toHaveText([second, first]);

    await app.theo.open();
    await expect(app.theo.conversationTitles).toHaveText([second, first]);
    await app.theo.reopenConversation(first);
    await expect(app.theo.said(second)).toBeHidden();
    const followUp = `And the week before? ${Date.now()}`;
    await app.theo.ask(followUp);
    await expect(app.theo.said(TheoStandIn.answerTo(followUp))).toBeVisible();
    const started = await theoRecords.lastAsking(first);
    const continued = await theoRecords.lastAsking(followUp);
    expect(continued?.threadId).toBe(started?.threadId);
    expect(continued?.session).toBe(started?.threadId);
    await expect(app.theo.conversationTitles).toHaveText([first, second]);

    const someoneElse = await visitors.arrive();
    await someoneElse.authentication.signIn(
      await registration.freshAccount('Theo stranger'),
    );
    await someoneElse.app.theo.open();
    await expect(someoneElse.app.theo.noConversationYet).toBeVisible();
    expect(
      await someoneElse.app.theo.connectStatusOf(String(started?.threadId)),
    ).toBe(404);
  });

  test('a visitor who is not signed in is asked to sign in, and the runtime refuses them', async ({
    app,
  }) => {
    await app.theo.open();

    await expect(app.theo.signInPrompt).toBeVisible();
    expect(await app.theo.runStatusWithoutConversation()).toBe(401);
  });
});
