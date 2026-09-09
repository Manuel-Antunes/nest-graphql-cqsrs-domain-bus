import { CommandBus } from '@nestjs/cqrs';
import type { TestingModule } from '@nestjs/testing';
import { createCqrsTestingModule, freshEm, RecordingEvents } from '../../../../test/support/cqrs-testing-module';
import { givenAPost, givenATag, T0 } from '../../../../test/support/post-fixtures';
import { PostUpdatedEvent } from '../../../domain/post/event/post-updated.event';
import { InvalidPostException } from '../../../domain/post/exception/invalid-post.exception';
import { PostNotFoundException } from '../../../domain/post/exception/post-not-found.exception';
import { Post } from '../../../domain/post/post.entity';
import { newPostId } from '../../../domain/post/vo/post-id';
import { PostRequest } from '../../shared/post-request';
import { UpdatePostCommand } from './update-post.command';

/** Request-scoped como todo command handler daqui: o caminho do teste é o `CommandBus`. */
describe('UpdatePostCommand.Handler', () => {
  let module: TestingModule;
  let commands: CommandBus;
  let events: RecordingEvents;

  const execute = (command: UpdatePostCommand.UpdatePost) => commands.execute(command, new PostRequest(command.postId));

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
      new PostUpdatedEvent(post.id, 'editado', 'oi', 'manuel', [{ tagId: tag.id, name: 'Untagged' }], 3, T0, expect.any(Date)),
    ]);
  });

  it('saves the post with the version bumped', async () => {
    const post = await givenAPost(module);

    await execute(new UpdatePostCommand.UpdatePost(post.id, undefined, 'novo conteúdo'));

    const saved = await freshEm(module).findOneOrFail(Post, { id: post.id });
    expect(saved).toMatchObject({ title: 'Nest + GraphQL', content: 'novo conteúdo', version: 2 });
    expect(saved.updatedAt.getTime()).toBeGreaterThan(saved.createdAt.getTime());
  });

  it('reflects previous updates', async () => {
    const post = await givenAPost(module);
    await execute(new UpdatePostCommand.UpdatePost(post.id, 'primeiro'));
    await execute(new UpdatePostCommand.UpdatePost(post.id, 'segundo'));

    const saved = await freshEm(module).findOneOrFail(Post, { id: post.id });
    expect(saved).toMatchObject({ title: 'segundo', version: 3 });
    expect(events.ofType(PostUpdatedEvent).map((e) => e.version)).toEqual([2, 3]);
  });

  it('rejects an update without changes and saves nothing', async () => {
    const post = await givenAPost(module);

    await expect(execute(new UpdatePostCommand.UpdatePost(post.id))).rejects.toThrow(InvalidPostException);
    await expect(execute(new UpdatePostCommand.UpdatePost(post.id, 'Nest + GraphQL', 'oi'))).rejects.toThrow(
      /update sem mudanças/,
    );

    expect(events.events).toEqual([]);
    expect((await freshEm(module).findOneOrFail(Post, { id: post.id })).version).toBe(1);
  });

  it('fails with PostNotFound when the post does not exist', async () => {
    await expect(execute(new UpdatePostCommand.UpdatePost(newPostId(), 'x'))).rejects.toThrow(PostNotFoundException);
    expect(events.events).toEqual([]);
  });
});
