import { ForeignKeyConstraintViolationException } from '@mikro-orm/core';
import { CommandBus } from '@nestjs/cqrs';
import type { TestingModule } from '@nestjs/testing';
import { createCqrsTestingModule, freshEm, RecordingEvents, inRequestContext } from '../../../../test/support/cqrs-testing-module';
import { givenAnAuthor, givenAPost, givenAUser } from '../../../../test/support/post-fixtures';
import { PostPreCreatedEvent } from '@nestposts/posts/domain/post/event/post-pre-created.event';
import { InvalidPostException } from '@nestposts/posts/domain/post/exception/invalid-post.exception';
import { PostAlreadyExistsException } from '@nestposts/posts/domain/post/exception/post-already-exists.exception';
import { Post } from '@nestposts/posts/domain/post/post.entity';
import { PostContent } from '@nestposts/posts/domain/post/vo/post-content';
import { PostTitle } from '@nestposts/posts/domain/post/vo/post-title';
import { PostId } from '@nestposts/posts/domain/post/vo/post-id';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';
import { UserName } from '@nestposts/users/domain/user/vo/user-name';
import { PostRequest } from '../../shared/post-request';
import { CreatePostCommand } from './create-post.command';

describe('CreatePostCommand.Handler', () => {
  let module: TestingModule;
  let commands: CommandBus;
  let events: RecordingEvents;
  let author: Awaited<ReturnType<typeof givenAnAuthor>>;

  const execute = (command: CreatePostCommand.CreatePost) =>
    inRequestContext(module, () => commands.execute(command, new PostRequest(command.postId)));

  beforeEach(async () => {
    module = await createCqrsTestingModule([CreatePostCommand.Handler]);
    commands = module.get(CommandBus);
    author = await givenAnAuthor(module);
    events = new RecordingEvents(module);
  });

  afterEach(() => module.close());

  it('publishes PostCreated and returns the id', async () => {
    const id = PostId.generate();

    const result = await execute(new CreatePostCommand.CreatePost(id, ' Nest + GraphQL ', 'oi', author.id, author.name));

    expect(result.equals(id)).toBe(true);
    expect(events.events).toEqual([
      new PostPreCreatedEvent(id.value, 'Nest + GraphQL', 'oi', author.id.value, 'manuel', expect.any(Date)),
    ]);
  });

  it('saves the post within the command', async () => {
    const id = PostId.generate();
    await execute(new CreatePostCommand.CreatePost(id, 'Nest + GraphQL', 'oi', author.id, author.name));

    const saved = await freshEm(module).findOneOrFail(Post, { id }, { populate: ['tags', 'author'] });

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

    await expect(execute(new CreatePostCommand.CreatePost(id, '   ', 'oi', author.id, author.name))).rejects.toThrow(InvalidPostException);

    expect(events.events).toEqual([]);
    expect(await freshEm(module).count(Post)).toBe(0);
  });

  it('rejects an id that already exists', async () => {
    const existing = await givenAPost(module);

    await expect(execute(new CreatePostCommand.CreatePost(existing.id, 'outro', 'oi', author.id, author.name))).rejects.toThrow(
      PostAlreadyExistsException,
    );

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

      await expect(execute(command)).rejects.toThrow(ForeignKeyConstraintViolationException);
      expect(await freshEm(module).findOne(Post, { id })).toBeNull();
    });

    it('refuses the id of a user with no authorship — the FK points at `authors`, not at `users`', async () => {
      const reader = await givenAUser(module);
      const id = PostId.generate();
      const command = new CreatePostCommand.CreatePost(id, 'Nest + GraphQL', 'oi', reader.id, reader.name);

      await expect(execute(command)).rejects.toThrow(ForeignKeyConstraintViolationException);
      expect(await freshEm(module).findOne(Post, { id })).toBeNull();
    });
  });
});
