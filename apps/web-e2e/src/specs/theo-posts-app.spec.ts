import { expect, test } from '../fixtures/test';
import { TheoStandIn } from '../infrastructure/agents/theo-stand-in';

const THEO_CATALOG = 'nestposts://a2ui/catalogs/theo/v1';

/**
 * **The posts MCP App, opened inside the conversation with Theo.**
 *
 * Everything but the model is the real thing. The web declares its A2UI catalog to Theo; Theo's
 * stand-in, told which question opens which tool, calls that tool on the posts MCP server — `apps/mcp`'s
 * image, Apollo MCP Server and the app behind Caddy — with the person's token, and answers the
 * delegation with the A2UI surface whose root `McpApp` names the server, the resource, the tool and its
 * result. CopilotKit's A2UI middleware draws it and its MCP Apps host loads the app from the server
 * through the web's `/api/copilotkit`, where every read and every button the app sends goes to the MCP
 * server as the person, and from there to the gateway and the posts API. What the person does in the app
 * is checked where it lands: the database, the saga, the conversation.
 */
test.describe('the posts MCP App in the conversation with Theo', () => {
  test('asked to edit a post, Theo opens the app on the author’s own posts; the one picked is edited and saved there, as the author, and the conversation hears it', async ({
    app,
    registration,
    authentication,
    publishing,
    postRecords,
    theoScript,
    theoRecords,
  }) => {
    const author = await registration.freshAuthor('Editor');
    const stamp = Date.now();
    const title = `A post to edit ${stamp}`;
    const another = `Another post of theirs ${stamp}`;
    const retitled = `Edited in the app ${stamp}`;
    const question = `I want to edit a post of my blog. ${stamp}`;

    await authentication.signIn(author);
    const postId = await publishing.publishThroughTheApi(title);
    await publishing.publishThroughTheApi(another);
    expect(await postRecords.whenVersion(postId, 2, 60_000)).toBeDefined();
    await theoScript.opensThePostsApp(question, {
      tool: 'ChoosePostToEdit',
      input: {},
    });
    const before = (await theoRecords.received()).length;

    await app.theo.open();
    await app.theo.ask(question);

    await expect(
      app.theo
        .delegationTo(TheoStandIn.DELEGATE)
        .getByText(TheoStandIn.delegateOpens('ChoosePostToEdit')),
    ).toBeVisible();
    const postsApp = app.theo.postsAppOn('ChoosePostToEdit');
    await expect(postsApp.postToEdit(title)).toBeVisible();
    await expect(postsApp.postToEdit(another)).toBeVisible();

    await postsApp.choose(title);
    await postsApp.retitle(retitled);

    await expect(postsApp.saved).toContainText('version 3');
    await expect(
      app.theo.heard(
        `I saved my changes to the post “${retitled}” (id ${postId})`,
      ),
    ).toBeVisible();
    expect(await postRecords.find(postId)).toMatchObject({
      title: retitled,
      version: 3,
    });

    const asked = (await theoRecords.received()).slice(before);
    expect(asked.map((invocation) => invocation.asked)).toEqual([question]);
    expect(asked[0]?.catalogs).toEqual([THEO_CATALOG]);
  });

  test('asked for a preview, Theo shows the draft as the blog will show it, nothing is published until the author publishes it from there, and the post is born, tagged and opened on the blog', async ({
    app,
    registration,
    authentication,
    postRecords,
    theoScript,
  }) => {
    const author = await registration.freshAuthor('Previewer');
    const stamp = Date.now();
    const draft = {
      title: `Previewed in the conversation ${stamp}`,
      content: `Written by the agent and approved by its author. ${stamp}`,
    };
    const question = `Write a post and show me a preview before publishing it. ${stamp}`;

    await authentication.signIn(author);
    await theoScript.opensThePostsApp(question, {
      tool: 'PreviewPost',
      input: draft,
    });

    await app.theo.open();
    await app.theo.ask(question);

    const postsApp = app.theo.postsAppOn('PreviewPost');
    await expect(postsApp.preview).toContainText('A new post');
    await expect(postsApp.preview).toContainText(draft.title);
    await expect(postsApp.preview).toContainText(draft.content);
    await expect(postsApp.preview).toContainText('not published yet');
    expect(await postRecords.count(draft.title)).toBe(0);

    await postsApp.publish();

    await expect(postsApp.published).toContainText(draft.title);
    const post = await postRecords.titled(draft.title);
    expect(post).toMatchObject({ author_id: author.credentialId });
    const postId = String(post?.id);
    await expect(
      app.theo.heard(
        `I approved the preview and published the post “${draft.title}” (id ${postId})`,
      ),
    ).toBeVisible();
    expect(await postRecords.whenVersion(postId, 2, 60_000)).toBeDefined();
    expect(await postRecords.tagsOf(postId)).not.toEqual([]);

    const onTheBlog = await postsApp.openOnTheBlog(postId);
    await expect(onTheBlog.text(draft.title)).toBeVisible();
  });

  test('discarding the preview publishes nothing, and the conversation hears it', async ({
    app,
    registration,
    authentication,
    postRecords,
    theoScript,
  }) => {
    const author = await registration.freshAuthor('Discarder');
    const stamp = Date.now();
    const draft = {
      title: `Never published ${stamp}`,
      content: `A draft its author did not want. ${stamp}`,
    };
    const question = `Draft a post for me to look at first. ${stamp}`;

    await authentication.signIn(author);
    await theoScript.opensThePostsApp(question, {
      tool: 'PreviewPost',
      input: draft,
    });

    await app.theo.open();
    await app.theo.ask(question);

    const postsApp = app.theo.postsAppOn('PreviewPost');
    await expect(postsApp.preview).toContainText(draft.title);
    await postsApp.discard();

    await expect(postsApp.discarded).toBeVisible();
    await expect(
      app.theo.heard(
        `I discarded the preview of “${draft.title}”: nothing was published.`,
      ),
    ).toBeVisible();
    expect(await postRecords.count(draft.title)).toBe(0);
  });

  test('the app acts as the person: a reader sees the preview, and the posts API refuses their publish', async ({
    app,
    registration,
    authentication,
    postRecords,
    theoScript,
  }) => {
    const reader = await registration.freshAccount('Reader');
    const stamp = Date.now();
    const draft = {
      title: `Not theirs to publish ${stamp}`,
      content: `A reader cannot publish this. ${stamp}`,
    };
    const question = `Preview a post for me. ${stamp}`;

    await authentication.signIn(reader);
    await theoScript.opensThePostsApp(question, {
      tool: 'PreviewPost',
      input: draft,
    });

    await app.theo.open();
    await app.theo.ask(question);

    const postsApp = app.theo.postsAppOn('PreviewPost');
    await expect(postsApp.preview).toContainText(draft.title);
    await postsApp.publish();

    await expect(postsApp.notPublished).toBeVisible();
    expect(await postRecords.count(draft.title)).toBe(0);
  });
});
