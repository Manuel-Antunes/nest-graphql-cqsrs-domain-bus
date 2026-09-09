import type { TestingModule } from '@nestjs/testing';
import { createCqrsTestingModule, freshEm, RecordingEvents } from '../../../../test/support/cqrs-testing-module';
import { givenAPost, T0 } from '../../../../test/support/post-fixtures';
import { PostUpdatedEvent } from '../../../domain/post/event/post-updated.event';
import { InvalidPostException } from '../../../domain/post/exception/invalid-post.exception';
import { PostNotFoundException } from '../../../domain/post/exception/post-not-found.exception';
import { Post } from '../../../domain/post/post.entity';
import { newPostId } from '../../../domain/post/vo/post-id';
import { UpdatePostCommand } from './update-post.command';
import { UpdatePostCommandHandler } from './update-post.handler';

describe('UpdatePostCommandHandler', () => {
  let module: TestingModule;
  let handler: UpdatePostCommandHandler;
  let events: RecordingEvents;

  beforeEach(async () => {
    module = await createCqrsTestingModule([UpdatePostCommandHandler]);
    handler = module.get(UpdatePostCommandHandler);
    events = new RecordingEvents(module);
  });

  afterEach(() => module.close());

  it('keeps untouched fields and publishes the resulting state', async () => {
    const tag = { tagId: '5f7a1c7e-4d0b-4b7a-9e3c-1a2b3c4d5e6f', name: 'Untagged' };
    const post = await givenAPost(module, { tags: [tag] });

    await handler.execute(new UpdatePostCommand(post.id, 'editado', null));

    expect(events.events).toEqual([
      new PostUpdatedEvent(post.id, 'editado', 'oi', 'manuel', [tag], 3, T0, expect.any(Date)),
    ]);
  });

  it('saves the post with the version bumped', async () => {
    const post = await givenAPost(module);

    await handler.execute(new UpdatePostCommand(post.id, undefined, 'novo conteúdo'));

    const saved = await freshEm(module).findOneOrFail(Post, { id: post.id });
    expect(saved).toMatchObject({ title: 'Nest + GraphQL', content: 'novo conteúdo', version: 2 });
    expect(saved.updatedAt.getTime()).toBeGreaterThan(saved.createdAt.getTime());
  });

  it('reflects previous updates', async () => {
    const post = await givenAPost(module);
    await handler.execute(new UpdatePostCommand(post.id, 'primeiro'));
    await handler.execute(new UpdatePostCommand(post.id, 'segundo'));

    const saved = await freshEm(module).findOneOrFail(Post, { id: post.id });
    expect(saved).toMatchObject({ title: 'segundo', version: 3 });
    expect(events.ofType(PostUpdatedEvent).map((e) => e.version)).toEqual([2, 3]);
  });

  it('rejects an update without changes and saves nothing', async () => {
    const post = await givenAPost(module);

    await expect(handler.execute(new UpdatePostCommand(post.id))).rejects.toThrow(InvalidPostException);
    await expect(handler.execute(new UpdatePostCommand(post.id, 'Nest + GraphQL', 'oi'))).rejects.toThrow(
      /update sem mudanças/,
    );

    expect(events.events).toEqual([]);
    expect((await freshEm(module).findOneOrFail(Post, { id: post.id })).version).toBe(1);
  });

  it('fails with PostNotFound when the post does not exist', async () => {
    await expect(handler.execute(new UpdatePostCommand(newPostId(), 'x'))).rejects.toThrow(PostNotFoundException);
    expect(events.events).toEqual([]);
  });
});
