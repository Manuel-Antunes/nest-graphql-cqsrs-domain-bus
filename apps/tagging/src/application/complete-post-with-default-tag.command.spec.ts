import { MikroORM } from '@mikro-orm/core';
import type { EventPublisher, IEvent } from '@nestjs/cqrs';
import { CommandBus, EventBus } from '@nestjs/cqrs';
import type { TestingModule } from '@nestjs/testing';
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
  Tag as PostTag,
} from '@nestposts/posts/domain/tag/tag.entity';
import {
  AppendEventsTransactionRejectedError,
  EventCriteria,
  EventMessage,
  EventSourcingRepository,
  EventStore,
  Tag,
  TRANSPORT_EVENT_BUS_PUBLISHER,
  UnitOfWorkFactory,
} from '@nestposts/transport-eventbus';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';

import {
  persistenceTesting,
  transportTesting,
} from '../../test/support/transport-testing.module';
import { CompletePostWithDefaultTagCommand } from './complete-post-with-default-tag.command';

describe('CompletePostWithDefaultTagCommand.Handler', () => {
  let module: TestingModule;
  let commands: CommandBus;
  let store: EventStore;
  let posts: EventSourcingRepository<Post>;
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

  const append = (...events: object[]) =>
    inContext(() =>
      store.append(
        undefined,
        events.map((event) => EventMessage.of(event)),
      ),
    );

  const appendElsewhere = (...events: object[]) =>
    module
      .get(MikroORM)
      .em.fork()
      .transactional((em) =>
        store.engine.appendEvents(
          events.map((event) => store.storedOf(EventMessage.of(event))),
          undefined,
          em,
        ),
      );

  const history = (id = postId) =>
    inContext(() =>
      store.source(EventCriteria.havingTags(new Tag('postId', id.value))),
    ).then((messages) => messages.map((message) => message.payload));

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
        ...transportTesting(),
      ],
      providers: [CompletePostWithDefaultTagCommand.Handler],
    }).compile();
    await module.init();
    commands = module.get(CommandBus);
    store = module.get(EventStore);
    posts = module.get(EventSourcingRepository);
    published.length = 0;
    module.get(EventBus).subscribe((event) => published.push(event));
  });

  afterEach(() => module.close());

  it('completes the post its stream describes, with the tag the domain decides', async () => {
    await append(preCreated());

    await complete();

    const post = await inContext(() => posts.load(postId));
    expect(post?.isComplete()).toBe(true);
    expect(post?.version).toBe(2);
    expect(post?.tags.getIdentifiers().map(String)).toEqual([DEFAULT_TAG_ID]);
  });

  it('publishes the decision as a fact of the Post aggregate', async () => {
    await append(preCreated());

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
    await append(preCreated());

    await complete();

    expect((await history()).map((event) => event.constructor.name)).toEqual([
      'PostPreCreatedEvent',
      'PostCreatedEvent',
    ]);
  });

  it('drops a decision the stream already carries: the aggregate is the last guard', async () => {
    await append(preCreated(), alreadyComplete());

    await expect(complete()).resolves.toBeUndefined();

    expect(published).toHaveLength(0);
    expect(await history()).toHaveLength(2);
  });

  it('refuses a decision on a history that changed after it was read: the post is the consistency boundary', async () => {
    await append(preCreated());
    const units = module.get(UnitOfWorkFactory);

    const decided = units.create().executeWithResult(async () => {
      const loaded = await posts.load(postId);
      if (!loaded) {
        throw new Error('the post was not sourced');
      }
      const post = module
        .get<EventPublisher>(TRANSPORT_EVENT_BUS_PUBLISHER)
        .mergeObjectContext(loaded);
      await appendElsewhere(alreadyComplete());
      post.complete([PostTag.default()], now);
      post.commit();
    });

    await expect(decided).rejects.toThrow(AppendEventsTransactionRejectedError);
    expect(await history()).toHaveLength(2);
  });

  it('refuses a post it has never heard of', async () => {
    await expect(complete(PostId.generate())).rejects.toThrow(
      PostNotFoundException,
    );
  });
});
