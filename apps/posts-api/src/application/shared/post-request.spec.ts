import type { TestingModule } from '@nestjs/testing';
import { AsyncContext, CommandBus } from '@nestjs/cqrs';
import { PostCreatedEvent } from '@nestposts/posts/domain/post/event/post-created.event';
import { PostPreCreatedEvent } from '@nestposts/posts/domain/post/event/post-pre-created.event';
import { PostId } from '@nestposts/posts/domain/post/vo/post-id';

import {
  createCqrsTestingModule,
  inRequestContext,
  RecordingEvents,
} from '../../../test/support/cqrs-testing-module';
import {
  givenAnAuthor,
  givenTheDefaultTag,
} from '../../../test/support/post-fixtures';
import { TaggingStandIn } from '../../../test/support/tagging-stand-in.saga';
import { CompletePostCommand } from '../post/command/complete-post.command';
import { CreatePostCommand } from '../post/command/create-post.command';
import { PostRequest } from './post-request';

describe('PostRequest', () => {
  let module: TestingModule;
  let commands: CommandBus;
  let events: RecordingEvents;
  let author: Awaited<ReturnType<typeof givenAnAuthor>>;

  beforeEach(async () => {
    module = await createCqrsTestingModule([
      CreatePostCommand.Handler,
      CompletePostCommand.Handler,
      TaggingStandIn,
    ]);
    commands = module.get(CommandBus);
    await givenTheDefaultTag(module);
    author = await givenAnAuthor(module);
    events = new RecordingEvents(module);
  });

  afterEach(() => module.close());

  it('is the same object on every event of the chain the request opened', async () => {
    const postId = PostId.generate();
    const request = new PostRequest(postId);

    await inRequestContext(module, () =>
      commands.execute(
        new CreatePostCommand.CreatePost(
          postId,
          'Nest + GraphQL',
          'oi',
          author.id,
          author.name,
        ),
        request,
      ),
    );
    const [preCreated, created] = await events.waitFor(2);

    expect([preCreated, created].map((event) => event.constructor)).toEqual([
      PostPreCreatedEvent,
      PostCreatedEvent,
    ]);
    expect(PostRequest.of(preCreated)).toBe(request);
    expect(PostRequest.of(created)).toBe(request);
    expect(PostRequest.of(created)?.postId).toBe(postId);
  });

  it('carries the PostId as a value object, not as the primitive on the payload', async () => {
    const postId = PostId.generate();

    await inRequestContext(module, () =>
      commands.execute(
        new CreatePostCommand.CreatePost(
          postId,
          'Nest + GraphQL',
          'oi',
          author.id,
          author.name,
        ),
        new PostRequest(postId),
      ),
    );
    const [created] = await events.waitFor(1);

    expect((created as PostPreCreatedEvent).postId).toBe(postId.value);
    expect(PostRequest.of(created)?.postId).toBe(postId);
  });

  it('rides along as metadata: it does not show up in what the event compares as', async () => {
    const postId = PostId.generate();

    await inRequestContext(module, () =>
      commands.execute(
        new CreatePostCommand.CreatePost(
          postId,
          'Nest + GraphQL',
          'oi',
          author.id,
          author.name,
        ),
        new PostRequest(postId),
      ),
    );
    const [created] = await events.waitFor(1);

    expect(created).toEqual(
      new PostPreCreatedEvent(
        postId.value,
        'Nest + GraphQL',
        'oi',
        author.id.value,
        'manuel',
        expect.any(Date),
      ),
    );
    expect(Object.keys(created as object)).toEqual([
      'postId',
      'title',
      'content',
      'authorId',
      'authorName',
      'occurredAt',
    ]);
  });

  it('a command dispatched without one still runs — on the anonymous context the CommandBus creates', async () => {
    const postId = PostId.generate();

    await inRequestContext(module, () =>
      commands.execute(
        new CreatePostCommand.CreatePost(
          postId,
          'sem request',
          'oi',
          author.id,
          author.name,
        ),
      ),
    );
    const [created] = await events.waitFor(1);

    expect(AsyncContext.of(created)).toBeInstanceOf(AsyncContext);
    expect(PostRequest.of(created)).toBeUndefined();
  });

  it('of() only answers for a request — an anonymous context is not one', () => {
    const message = {};
    new AsyncContext().attachTo(message);

    expect(AsyncContext.of(message)).toBeInstanceOf(AsyncContext);
    expect(PostRequest.of(message)).toBeUndefined();
  });
});
