import type { TestingModule } from '@nestjs/testing';
import { createCqrsTestingModule, freshEm, RecordingEvents } from '../../../../test/support/cqrs-testing-module';
import { givenAPost, givenATag, T0 } from '../../../../test/support/post-fixtures';
import { PostUpdatedEvent } from '../../../domain/post/event/post-updated.event';
import { InvalidPostException } from '../../../domain/post/exception/invalid-post.exception';
import { PostNotFoundException } from '../../../domain/post/exception/post-not-found.exception';
import { Post } from '../../../domain/post/post.entity';
import { newPostId } from '../../../domain/post/vo/post-id';
import { TagNotFoundException } from '../../../domain/tag/exception/tag-not-found.exception';
import { newTagId } from '../../../domain/tag/vo/tag-id';
import { AssignTagToPostCommand } from './assign-tag-to-post.command';
import { AssignTagToPostCommandHandler } from './assign-tag-to-post.handler';

describe('AssignTagToPostCommandHandler', () => {
  let module: TestingModule;
  let handler: AssignTagToPostCommandHandler;
  let events: RecordingEvents;

  beforeEach(async () => {
    module = await createCqrsTestingModule([AssignTagToPostCommandHandler]);
    handler = module.get(AssignTagToPostCommandHandler);
    events = new RecordingEvents(module);
  });

  afterEach(() => module.close());

  it('publishes PostUpdated with the tag and saves the post', async () => {
    const post = await givenAPost(module);
    const tag = await givenATag(module, 'Untagged');

    await handler.execute(new AssignTagToPostCommand(post.id, tag.id));

    const ref = { tagId: tag.id, name: 'Untagged' };
    expect(events.events).toEqual([
      new PostUpdatedEvent(post.id, 'Nest + GraphQL', 'oi', 'manuel', [ref], 2, T0, expect.any(Date)),
    ]);
    const saved = await freshEm(module).findOneOrFail(Post, { id: post.id });
    expect(saved).toMatchObject({ version: 2, tags: [ref] });
  });

  it('rejects a tag the post already has', async () => {
    const tag = await givenATag(module, 'Untagged');
    const post = await givenAPost(module, { tags: [{ tagId: tag.id, name: tag.name }] });

    await expect(handler.execute(new AssignTagToPostCommand(post.id, tag.id))).rejects.toThrow(InvalidPostException);

    expect(events.events).toEqual([]);
    expect((await freshEm(module).findOneOrFail(Post, { id: post.id })).version).toBe(2);
  });

  it('fails with TagNotFound when the tag does not exist', async () => {
    const post = await givenAPost(module);

    await expect(handler.execute(new AssignTagToPostCommand(post.id, newTagId()))).rejects.toThrow(TagNotFoundException);
  });

  it('fails with PostNotFound when the post does not exist', async () => {
    const tag = await givenATag(module);

    await expect(handler.execute(new AssignTagToPostCommand(newPostId(), tag.id))).rejects.toThrow(PostNotFoundException);
  });
});
