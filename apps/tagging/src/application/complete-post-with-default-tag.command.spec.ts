import type { IEvent } from '@nestjs/cqrs';
import type { TestingModule } from '@nestjs/testing';
import { MikroORM } from '@mikro-orm/core';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { CommandBus, EventBus } from '@nestjs/cqrs';
import { Test } from '@nestjs/testing';
import { CqsrsModule } from '@nestposts/cqsrs';
import { inRequestContext } from '@nestposts/database';
import { PostCreatedEvent } from '@nestposts/posts/domain/post/event/post-created.event';
import { PostPreCreatedEvent } from '@nestposts/posts/domain/post/event/post-pre-created.event';
import { PostNotFoundException } from '@nestposts/posts/domain/post/exception/post-not-found.exception';
import { Post } from '@nestposts/posts/domain/post/post.entity';
import { PostId } from '@nestposts/posts/domain/post/vo/post-id';
import {
  DEFAULT_TAG_ID,
  DEFAULT_TAG_NAME,
} from '@nestposts/posts/domain/tag/tag.entity';
import {
  EventLog,
  EventSourcedRepository,
  TRANSPORT_EVENT_BUS_PUBLISHER,
} from '@nestposts/transport-eventbus';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';

import {
  persistenceTesting,
  transportTesting,
} from '../../test/support/transport-testing.module';
import { mikroOrmConfig } from '../infrastructure/persistence/mikro-orm.config';
import { CompletePostWithDefaultTagCommand } from './complete-post-with-default-tag.command';

describe('CompletePostWithDefaultTagCommand.Handler', () => {
  let module: TestingModule;
  let commands: CommandBus;
  let log: EventLog;
  let posts: EventSourcedRepository<Post>;
  const published: IEvent[] = [];

  const postId = PostId.generate();
  const authorId = UserId.generate();
  const now = new Date('2026-09-08T12:00:00.000Z');

  const preCreated = (id = postId) =>
    new PostPreCreatedEvent(
      id.value,
      'Nest + GraphQL',
      'oi',
      authorId.value,
      'manuel',
      now,
    );
  const alreadyComplete = (id = postId) =>
    new PostCreatedEvent(
      id.value,
      'Nest + GraphQL',
      'oi',
      authorId.value,
      [{ tagId: DEFAULT_TAG_ID, name: DEFAULT_TAG_NAME }],
      2,
      now,
    );

  const inContext = <T>(work: () => Promise<T>): Promise<T> =>
    inRequestContext(module.get(MikroORM).em, work);

  const complete = (id = postId) =>
    inContext(() =>
      commands.execute(
        new CompletePostWithDefaultTagCommand.CompletePostWithDefaultTag(id),
      ),
    );

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [
        CqsrsModule.forRoot({
          aggregatePublisher: TRANSPORT_EVENT_BUS_PUBLISHER,
        }),
        ...persistenceTesting(),
        transportTesting(),
      ],
      providers: [CompletePostWithDefaultTagCommand.Handler],
    }).compile();
    await module.init();
    commands = module.get(CommandBus);
    log = module.get(EventLog);
    posts = module.get(EventSourcedRepository);
    published.length = 0;
    module.get(EventBus).subscribe((event) => published.push(event));
  });

  afterEach(() => module.close());

  it('completes the post its stream describes, with the tag the domain decides', async () => {
    await inContext(() => log.append([preCreated()], postId.value));

    await complete();

    const post = await inContext(() => posts.load(postId));
    expect(post?.isComplete()).toBe(true);
    expect(post?.version).toBe(2);
    expect(post?.tags.getIdentifiers().map(String)).toEqual([DEFAULT_TAG_ID]);
  });

  it('publishes the decision as a fact of the Post aggregate', async () => {
    await inContext(() => log.append([preCreated()], postId.value));

    await complete();

    expect(published).toHaveLength(1);
    expect(published[0]).toBeInstanceOf(PostCreatedEvent);
    expect(published[0]).toMatchObject({
      postId: postId.value,
      version: 2,
      tags: [{ tagId: DEFAULT_TAG_ID, name: DEFAULT_TAG_NAME }],
    });
  });

  it('appends its decision to the stream, so the next delivery reads it back', async () => {
    await inContext(() => log.append([preCreated()], postId.value));

    await complete();

    const history = await inContext(() => log.readStream(postId.value));
    expect(history.map((event) => event.constructor.name)).toEqual([
      'PostPreCreatedEvent',
      'PostCreatedEvent',
    ]);
  });

  it('drops a decision the stream already carries: the aggregate is the last guard', async () => {
    await inContext(() =>
      log.append([preCreated(), alreadyComplete()], postId.value),
    );

    await expect(complete()).resolves.toBeUndefined();

    expect(published).toHaveLength(0);
    expect(await inContext(() => log.readStream(postId.value))).toHaveLength(2);
  });

  it('refuses a post it has never heard of', async () => {
    await expect(complete(PostId.generate())).rejects.toThrow(
      PostNotFoundException,
    );
  });
});
