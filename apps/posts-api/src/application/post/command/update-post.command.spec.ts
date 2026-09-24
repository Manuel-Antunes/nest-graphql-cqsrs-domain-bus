import { CommandBus } from '@nestjs/cqrs';
import type { TestingModule } from '@nestjs/testing';
import type { TestStorage } from '@nestposts/asset/infrastructure/testing/test-storage';
import { setupTestStorage } from '@nestposts/asset/infrastructure/testing/test-storage';
import { PostUpdatedEvent } from '@nestposts/posts/domain/post/event/post-updated.event';
import { InvalidPostException } from '@nestposts/posts/domain/post/exception/invalid-post.exception';
import { PostNotFoundException } from '@nestposts/posts/domain/post/exception/post-not-found.exception';
import { Post } from '@nestposts/posts/domain/post/post.entity';
import { PostContent } from '@nestposts/posts/domain/post/vo/post-content';
import { PostId } from '@nestposts/posts/domain/post/vo/post-id';
import { PostTitle } from '@nestposts/posts/domain/post/vo/post-title';

import {
  attachmentsOn,
  contentsOf,
  givenAnUpload,
  storedIn,
} from '../../../../test/support/attachments';
import {
  createCqrsTestingModule,
  freshEm,
  inRequestContext,
  RecordingEvents,
} from '../../../../test/support/cqrs-testing-module';
import {
  givenAnAuthor,
  givenAPost,
  givenATag,
  T0,
} from '../../../../test/support/post-fixtures';
import { UploadArea, UploadNotOwnedException } from '../../asset/upload-area';
import { PostRequest } from '../../shared/post-request';
import { UpdatePostCommand } from './update-post.command';

describe('UpdatePostCommand.Handler', () => {
  let module: TestingModule;
  let commands: CommandBus;
  let events: RecordingEvents;

  const execute = (command: UpdatePostCommand.UpdatePost) =>
    inRequestContext(module, () =>
      commands.execute(command, new PostRequest(command.postId)),
    );

  beforeEach(async () => {
    module = await createCqrsTestingModule([UpdatePostCommand.Handler]);
    commands = module.get(CommandBus);
    events = new RecordingEvents(module);
  });

  afterEach(() => module.close());

  it('keeps untouched fields and publishes the resulting state', async () => {
    const tag = await givenATag(module, 'Untagged');
    const post = await givenAPost(module, { tags: [tag] });

    await execute(new UpdatePostCommand.UpdatePost(post.id, 'editado', null));

    expect(events.events).toEqual([
      new PostUpdatedEvent(
        post.id.value,
        'editado',
        'oi',
        post.author.id.value,
        'manuel',
        [{ tagId: tag.id.value, name: 'Untagged' }],
        3,
        T0,
        expect.any(Date),
      ),
    ]);
  });

  it('saves the post with the version bumped', async () => {
    const post = await givenAPost(module);

    await execute(
      new UpdatePostCommand.UpdatePost(post.id, undefined, 'novo conteúdo'),
    );

    const saved = await freshEm(module).findOneOrFail(Post, { id: post.id });
    expect(saved).toMatchObject({
      title: PostTitle.parse('Nest + GraphQL'),
      content: PostContent.parse('novo conteúdo'),
      version: 2,
    });
    expect(saved.updatedAt.getTime()).toBeGreaterThan(
      saved.createdAt.getTime(),
    );
  });

  it('reflects previous updates', async () => {
    const post = await givenAPost(module);
    await execute(new UpdatePostCommand.UpdatePost(post.id, 'primeiro'));
    await execute(new UpdatePostCommand.UpdatePost(post.id, 'segundo'));

    const saved = await freshEm(module).findOneOrFail(Post, { id: post.id });
    expect(saved).toMatchObject({
      title: PostTitle.parse('segundo'),
      version: 3,
    });
    expect(events.ofType(PostUpdatedEvent).map((e) => e.version)).toEqual([
      2, 3,
    ]);
  });

  it('rejects an update without changes and saves nothing', async () => {
    const post = await givenAPost(module);

    await expect(
      execute(new UpdatePostCommand.UpdatePost(post.id)),
    ).rejects.toThrow(InvalidPostException);
    await expect(
      execute(
        new UpdatePostCommand.UpdatePost(post.id, 'Nest + GraphQL', 'oi'),
      ),
    ).rejects.toThrow(/update sem mudanças/);

    expect(events.events).toEqual([]);
    expect(
      (await freshEm(module).findOneOrFail(Post, { id: post.id })).version,
    ).toBe(1);
  });

  it('fails with PostNotFound when the post does not exist', async () => {
    await expect(
      execute(new UpdatePostCommand.UpdatePost(PostId.generate(), 'x')),
    ).rejects.toThrow(PostNotFoundException);
    expect(events.events).toEqual([]);
  });
});

describe('UpdatePostCommand.Handler, with an attachment', () => {
  let storage: TestStorage;
  let module: TestingModule;

  const execute = (command: UpdatePostCommand.UpdatePost) =>
    inRequestContext(module, () =>
      module.get(CommandBus).execute(command, new PostRequest(command.postId)),
    );

  const givenAPostWithAFile = async () => {
    const author = await givenAnAuthor(module);
    const upload = await givenAnUpload(module, author.id, 'first');
    const post = await givenAPost(module, {
      author,
      asset: UploadArea.stage(upload, author.id),
    });
    return { author, post, stored: post.asset?.name as string };
  };

  beforeAll(async () => {
    storage = await setupTestStorage();
  });

  afterAll(() => storage?.stop());

  beforeEach(async () => {
    module = await createCqrsTestingModule(
      [UpdatePostCommand.Handler],
      attachmentsOn(storage),
    );
  });

  afterEach(() => module.close());

  it('replaces only the file: the new one is kept, the old one deleted, the text untouched', async () => {
    const { author, post, stored } = await givenAPostWithAFile();
    const replacement = await givenAnUpload(module, author.id, 'second');

    await execute(
      new UpdatePostCommand.UpdatePost(
        post.id,
        null,
        null,
        replacement,
        author.id,
      ),
    );

    const saved = await freshEm(module).findOneOrFail(Post, { id: post.id });
    const replaced = saved.asset?.name as string;
    expect(replaced).toMatch(/^assets\/[0-9a-f-]{36}\.png$/);
    expect(replaced).not.toBe(stored);
    expect(saved).toMatchObject({
      title: PostTitle.parse('Nest + GraphQL'),
      content: PostContent.parse('oi'),
    });
    await expect(contentsOf(module, replaced)).resolves.toBe('second');
    await expect(storedIn(module, stored)).resolves.toBe(false);
    await expect(storedIn(module, replacement.name)).resolves.toBe(false);
  });

  it('changes the text and the file in one go', async () => {
    const { author, post, stored } = await givenAPostWithAFile();
    const replacement = await givenAnUpload(module, author.id, 'second');

    await execute(
      new UpdatePostCommand.UpdatePost(
        post.id,
        'Novo título',
        null,
        replacement,
        author.id,
      ),
    );

    const saved = await freshEm(module).findOneOrFail(Post, { id: post.id });
    expect(saved.title).toEqual(PostTitle.parse('Novo título'));
    expect(saved.asset?.name).not.toBe(stored);
    await expect(storedIn(module, stored)).resolves.toBe(false);
  });

  it('refuses a replacement somebody else uploaded, and keeps the current file', async () => {
    const { author, post, stored } = await givenAPostWithAFile();
    const somebodyElse = await givenAnAuthor(module);
    const foreign = await givenAnUpload(module, somebodyElse.id, 'foreign');

    await expect(
      execute(
        new UpdatePostCommand.UpdatePost(
          post.id,
          null,
          null,
          foreign,
          author.id,
        ),
      ),
    ).rejects.toThrow(UploadNotOwnedException);

    const saved = await freshEm(module).findOneOrFail(Post, { id: post.id });
    expect(saved.asset?.name).toBe(stored);
    await expect(storedIn(module, stored)).resolves.toBe(true);
  });

  it('still refuses an update that changes nothing at all', async () => {
    const { post } = await givenAPostWithAFile();

    await expect(
      execute(new UpdatePostCommand.UpdatePost(post.id, null, null)),
    ).rejects.toThrow(InvalidPostException);
  });
});
