import { CommandBus } from '@nestjs/cqrs';
import type { TestingModule } from '@nestjs/testing';
import { PostCreatedEvent } from '@nestposts/posts/domain/post/event/post-created.event';
import { PostNotFoundException } from '@nestposts/posts/domain/post/exception/post-not-found.exception';
import { Post } from '@nestposts/posts/domain/post/post.entity';
import { PostId } from '@nestposts/posts/domain/post/vo/post-id';
import { TagNotFoundException } from '@nestposts/posts/domain/tag/exception/tag-not-found.exception';
import { TagId } from '@nestposts/posts/domain/tag/vo/tag-id';

import {
  createCqrsTestingModule,
  freshEm,
  inRequestContext,
  RecordingEvents,
} from '../../../../test/support/cqrs-testing-module';
import {
  givenAPost,
  givenATag,
  givenTheDefaultTag,
} from '../../../../test/support/post-fixtures';
import { PostRequest } from '../../shared/post-request';
import { CompletePostCommand } from './complete-post.command';

describe('CompletePostCommand.Handler', () => {
  let module: TestingModule;
  let commands: CommandBus;
  let events: RecordingEvents;

  const complete = (postId: PostId, tagId: TagId) =>
    inRequestContext(module, () =>
      commands.execute(
        new CompletePostCommand.CompletePost(postId, tagId),
        new PostRequest(postId),
      ),
    );

  beforeEach(async () => {
    module = await createCqrsTestingModule([CompletePostCommand.Handler]);
    commands = module.get(CommandBus);
    events = new RecordingEvents(module);
  });

  afterEach(() => module.close());

  it('completes the post with the tag, at version 2, and publishes PostCreated', async () => {
    const tag = await givenTheDefaultTag(module);
    const post = await givenAPost(module);

    await complete(post.id, tag.id);

    const saved = await freshEm(module).findOneOrFail(
      Post,
      { id: post.id },
      { populate: ['tags'] },
    );
    expect(saved.isComplete()).toBe(true);
    expect(saved.version).toBe(2);
    expect(saved.tags.getIdentifiers().map(String)).toEqual([tag.id.value]);
    expect(events.ofType(PostCreatedEvent)).toHaveLength(1);
    expect(events.ofType(PostCreatedEvent)[0]).toMatchObject({
      postId: post.id.value,
      version: 2,
      tags: [{ tagId: tag.id.value, name: tag.name.value }],
    });
  });

  it('carries the request through, so the chain stays one request', async () => {
    const tag = await givenTheDefaultTag(module);
    const post = await givenAPost(module);

    await complete(post.id, tag.id);

    expect(
      PostRequest.of(events.ofType(PostCreatedEvent)[0])?.postId.equals(
        post.id,
      ),
    ).toBe(true);
  });

  it('treats a second decision as a duplicate delivery: it is success, and nothing is published', async () => {
    const tag = await givenTheDefaultTag(module);
    const post = await givenAPost(module);
    await complete(post.id, tag.id);

    await expect(complete(post.id, tag.id)).resolves.toBeUndefined();

    expect(events.ofType(PostCreatedEvent)).toHaveLength(1);
    expect(
      (await freshEm(module).findOneOrFail(Post, { id: post.id })).version,
    ).toBe(2);
  });

  it('refuses a post that does not exist', async () => {
    const tag = await givenTheDefaultTag(module);

    await expect(complete(PostId.generate(), tag.id)).rejects.toThrow(
      PostNotFoundException,
    );
  });

  it('refuses a tag that does not exist, so the post is not completed with a dangling reference', async () => {
    const post = await givenAPost(module);

    await expect(complete(post.id, TagId.generate())).rejects.toThrow(
      TagNotFoundException,
    );

    expect(
      (await freshEm(module).findOneOrFail(Post, { id: post.id })).isComplete(),
    ).toBe(false);
  });

  it('completes with whatever tag the decision named, not only the default one', async () => {
    const chosen = await givenATag(module, 'nestjs');
    const post = await givenAPost(module);

    await complete(post.id, chosen.id);

    const saved = await freshEm(module).findOneOrFail(
      Post,
      { id: post.id },
      { populate: ['tags'] },
    );
    expect(saved.tags.getIdentifiers().map(String)).toEqual([chosen.id.value]);
  });
});
