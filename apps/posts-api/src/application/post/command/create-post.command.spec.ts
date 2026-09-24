import { ForeignKeyConstraintViolationException } from '@mikro-orm/core';
import { CommandBus } from '@nestjs/cqrs';
import type { TestingModule } from '@nestjs/testing';
import type { TestStorage } from '@nestposts/asset/infrastructure/testing/test-storage';
import { setupTestStorage } from '@nestposts/asset/infrastructure/testing/test-storage';
import { PostPreCreatedEvent } from '@nestposts/posts/domain/post/event/post-pre-created.event';
import { InvalidPostException } from '@nestposts/posts/domain/post/exception/invalid-post.exception';
import { PostAlreadyExistsException } from '@nestposts/posts/domain/post/exception/post-already-exists.exception';
import { Post } from '@nestposts/posts/domain/post/post.entity';
import { PostContent } from '@nestposts/posts/domain/post/vo/post-content';
import { PostId } from '@nestposts/posts/domain/post/vo/post-id';
import { PostTitle } from '@nestposts/posts/domain/post/vo/post-title';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';
import { UserName } from '@nestposts/users/domain/user/vo/user-name';

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
  givenAUser,
} from '../../../../test/support/post-fixtures';
import { UploadNotOwnedException } from '../../asset/upload-area';
import { PostRequest } from '../../shared/post-request';
import { CreatePostCommand } from './create-post.command';

describe('CreatePostCommand.Handler', () => {
  let module: TestingModule;
  let commands: CommandBus;
  let events: RecordingEvents;
  let author: Awaited<ReturnType<typeof givenAnAuthor>>;

  const execute = (command: CreatePostCommand.CreatePost) =>
    inRequestContext(module, () =>
      commands.execute(command, new PostRequest(command.postId)),
    );

  beforeEach(async () => {
    module = await createCqrsTestingModule([CreatePostCommand.Handler]);
    commands = module.get(CommandBus);
    author = await givenAnAuthor(module);
    events = new RecordingEvents(module);
  });

  afterEach(() => module.close());

  it('publishes PostCreated and returns the id', async () => {
    const id = PostId.generate();

    const result = await execute(
      new CreatePostCommand.CreatePost(
        id,
        ' Nest + GraphQL ',
        'oi',
        author.id,
        author.name,
      ),
    );

    expect(result.equals(id)).toBe(true);
    expect(events.events).toEqual([
      new PostPreCreatedEvent(
        id.value,
        'Nest + GraphQL',
        'oi',
        author.id.value,
        'manuel',
        expect.any(Date),
      ),
    ]);
  });

  it('saves the post within the command', async () => {
    const id = PostId.generate();
    await execute(
      new CreatePostCommand.CreatePost(
        id,
        'Nest + GraphQL',
        'oi',
        author.id,
        author.name,
      ),
    );

    const saved = await freshEm(module).findOneOrFail(
      Post,
      { id },
      { populate: ['tags', 'author'] },
    );

    expect(saved).toMatchObject({
      id,
      title: PostTitle.parse('Nest + GraphQL'),
      content: PostContent.parse('oi'),
      version: 1,
    });
    expect(saved.author.id.equals(author.id)).toBe(true);
    expect(saved.tags.getItems()).toEqual([]);
    expect(saved.createdAt).toEqual(saved.updatedAt);
    expect(saved.getUncommittedEvents()).toEqual([]);
  });

  it('rejects a blank title without saving anything', async () => {
    const id = PostId.generate();

    await expect(
      execute(
        new CreatePostCommand.CreatePost(
          id,
          '   ',
          'oi',
          author.id,
          author.name,
        ),
      ),
    ).rejects.toThrow(InvalidPostException);

    expect(events.events).toEqual([]);
    expect(await freshEm(module).count(Post)).toBe(0);
  });

  it('rejects an id that already exists', async () => {
    const existing = await givenAPost(module);

    await expect(
      execute(
        new CreatePostCommand.CreatePost(
          existing.id,
          'outro',
          'oi',
          author.id,
          author.name,
        ),
      ),
    ).rejects.toThrow(PostAlreadyExistsException);

    expect(events.events).toEqual([]);
    expect(await freshEm(module).count(Post)).toBe(1);
  });

  describe('a chave estrangeira é a garantia, e não uma checagem antes', () => {
    it('recusa um authorId que não existe, sem gravar nada', async () => {
      const id = PostId.generate();
      const command = new CreatePostCommand.CreatePost(
        id,
        'Nest + GraphQL',
        'oi',
        UserId.generate(),
        UserName.parse('fantasma'),
      );

      await expect(execute(command)).rejects.toThrow(
        ForeignKeyConstraintViolationException,
      );
      expect(await freshEm(module).findOne(Post, { id })).toBeNull();
    });

    it('refuses the id of a user with no authorship — the FK points at `authors`, not at `users`', async () => {
      const reader = await givenAUser(module);
      const id = PostId.generate();
      const command = new CreatePostCommand.CreatePost(
        id,
        'Nest + GraphQL',
        'oi',
        reader.id,
        reader.name,
      );

      await expect(execute(command)).rejects.toThrow(
        ForeignKeyConstraintViolationException,
      );
      expect(await freshEm(module).findOne(Post, { id })).toBeNull();
    });
  });
});

describe('CreatePostCommand.Handler, with an attachment', () => {
  let storage: TestStorage;
  let module: TestingModule;
  let author: Awaited<ReturnType<typeof givenAnAuthor>>;

  const execute = (command: CreatePostCommand.CreatePost) =>
    inRequestContext(module, () =>
      module.get(CommandBus).execute(command, new PostRequest(command.postId)),
    );

  beforeAll(async () => {
    storage = await setupTestStorage();
  });

  afterAll(() => storage?.stop());

  beforeEach(async () => {
    module = await createCqrsTestingModule(
      [CreatePostCommand.Handler],
      attachmentsOn(storage),
    );
    author = await givenAnAuthor(module);
  });

  afterEach(() => module.close());

  it('moves the upload out of staging and keeps it with the post', async () => {
    const upload = await givenAnUpload(module, author.id);
    const id = PostId.generate();

    await execute(
      new CreatePostCommand.CreatePost(
        id,
        'Com anexo',
        'oi',
        author.id,
        author.name,
        upload,
      ),
    );

    const saved = await freshEm(module).findOneOrFail(Post, { id });
    const stored = saved.asset?.name as string;
    expect(stored).toMatch(/^assets\/[0-9a-f-]{36}\.png$/);
    expect(saved.asset?.persisted).toBe(true);
    expect(saved.asset?.url).toContain(stored);
    await expect(contentsOf(module, stored)).resolves.toBe('image-bytes');
    await expect(storedIn(module, upload.name)).resolves.toBe(false);
  });

  it('refuses an upload somebody else made, and stores nothing', async () => {
    const somebodyElse = await givenAnAuthor(module);
    const upload = await givenAnUpload(module, somebodyElse.id);
    const id = PostId.generate();

    await expect(
      execute(
        new CreatePostCommand.CreatePost(
          id,
          'Com anexo alheio',
          'oi',
          author.id,
          author.name,
          upload,
        ),
      ),
    ).rejects.toThrow(UploadNotOwnedException);

    expect(await freshEm(module).findOne(Post, { id })).toBeNull();
    await expect(storedIn(module, upload.name)).resolves.toBe(true);
  });
});
