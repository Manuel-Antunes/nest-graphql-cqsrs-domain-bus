import { MikroORM } from '@mikro-orm/core';
import { Test } from '@nestjs/testing';
import { inRequestContext } from '@nestposts/database';
import { PostCreatedEvent } from '@nestposts/posts/domain/post/event/post-created.event';
import { PostPreCreatedEvent } from '@nestposts/posts/domain/post/event/post-pre-created.event';
import { Post } from '@nestposts/posts/domain/post/post.entity';
import { PostId } from '@nestposts/posts/domain/post/vo/post-id';
import {
  DEFAULT_TAG_ID,
  DEFAULT_TAG_NAME,
} from '@nestposts/posts/domain/tag/tag.entity';
import {
  EventEnvelope,
  EventSourcedRepository,
  envelopeFrom,
  MemoryClient,
  MemoryEventEnvelopeSerializer,
  MessageInbox,
  reconstruct,
  TRANSPORT_IDENTIFIER,
  TRANSPORT_MESSAGE_TYPE,
  TRANSPORT_ORIGIN,
  TRANSPORT_TAGS,
  TRANSPORT_TIMESTAMP,
} from '@nestposts/transport-eventbus';
import type { InProcessService } from '@nestposts/transport-eventbus/testing';
import {
  RecordingClient,
  startInProcessService,
} from '@nestposts/transport-eventbus/testing';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';
import { lastValueFrom } from 'rxjs';

import { AppModule } from '../src/app.module';
import { POST_EVENTS_CLIENT } from '../src/infrastructure/transport/transport.config';
import { until } from './support/until';

describe('the tagging service', () => {
  let tagging: InProcessService;
  let postsApi: MemoryClient;
  let outbound: RecordingClient;
  let posts: EventSourcedRepository<Post>;
  let inbox: MessageInbox;

  const authorId = UserId.generate();

  const preCreatedFrom = (
    postId: PostId,
    identifier = `evt-${postId.value}`,
    metadata: Record<string, string> = {},
  ) =>
    new EventEnvelope(
      new PostPreCreatedEvent(
        postId.value,
        'Nest + GraphQL',
        'oi',
        authorId.value,
        'manuel',
        new Date('2026-09-08T12:00:00.000Z'),
      ),
      {
        [TRANSPORT_MESSAGE_TYPE]: 'posts.PostPreCreated#1.0.0',
        [TRANSPORT_IDENTIFIER]: identifier,
        [TRANSPORT_TIMESTAMP]: '2026-09-08T12:00:00.000Z',
        [TRANSPORT_ORIGIN]: 'posts-api',
        [TRANSPORT_TAGS]: `postId=${postId.value}`,
        ...metadata,
      },
    );

  const deliver = (postId: PostId, envelope: EventEnvelope<object>) =>
    lastValueFrom(
      postsApi.emit(`posts.PostPreCreated.${postId.value}`, envelope),
    );

  const inContext = <T>(work: () => Promise<T>): Promise<T> =>
    inRequestContext(tagging.app.get(MikroORM).em, work);

  const completions = () =>
    outbound.sent.filter(({ pattern }) =>
      pattern.startsWith('posts.PostCreated.'),
    );

  const envelopeOf = (index = 0) => envelopeFrom(completions()[index].data);

  beforeAll(async () => {
    tagging = await startInProcessService(
      await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(POST_EVENTS_CLIENT)
        .useValue(new RecordingClient())
        .compile(),
    );
    postsApi = new MemoryClient({
      servers: [tagging.server],
      serializer: new MemoryEventEnvelopeSerializer(),
    });
    outbound = tagging.app.get(POST_EVENTS_CLIENT);
    posts = tagging.app.get(EventSourcedRepository);
    inbox = tagging.app.get(MessageInbox);
  });

  afterAll(() => tagging.close());

  beforeEach(() => {
    outbound.clear();
  });

  it('binds its queue to the whole posts namespace: one entry for what it acts on and what it replicates', () => {
    expect(postsApi.bindings()).toEqual(['posts.#']);
  });

  it('completes a post it was told was born, and publishes the decision', async () => {
    const postId = PostId.generate();

    await deliver(postId, preCreatedFrom(postId));
    await until(() => completions().length === 1);

    expect(completions()[0].pattern).toBe(`posts.PostCreated.${postId.value}`);
    const event = reconstruct(envelopeOf());
    expect(event).toBeInstanceOf(PostCreatedEvent);
    expect(event).toMatchObject({
      postId: postId.value,
      version: 2,
      tags: [{ tagId: DEFAULT_TAG_ID, name: DEFAULT_TAG_NAME }],
    });
  });

  it('keeps both events in its own stream: the one it received and the one it decided', async () => {
    const postId = PostId.generate();

    await deliver(postId, preCreatedFrom(postId));
    await until(() => completions().length === 1);

    const post = await inContext(() => posts.load(postId));
    expect(post?.isComplete()).toBe(true);
    expect(post?.version).toBe(2);
    expect(post?.tags.getIdentifiers().map(String)).toEqual([DEFAULT_TAG_ID]);
  });

  it('remembers the message it received, and who sent it', async () => {
    const postId = PostId.generate();

    await deliver(postId, preCreatedFrom(postId));
    await until(() => completions().length === 1);

    await expect(inContext(() => inbox.received())).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          identifier: `evt-${postId.value}`,
          messageType: 'posts.PostPreCreated#1.0.0',
          origin: 'posts-api',
        }),
      ]),
    );
  });

  it('decides once, however many times the same message is delivered', async () => {
    const postId = PostId.generate();
    const message = preCreatedFrom(postId);

    await deliver(postId, message);
    await until(() => completions().length === 1);
    await deliver(postId, message);
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(completions()).toHaveLength(1);
  });

  it('refuses a second creation of the same stream, so its decision still stands', async () => {
    const postId = PostId.generate();
    await deliver(postId, preCreatedFrom(postId));
    await until(() => completions().length === 1);

    await deliver(postId, preCreatedFrom(postId, 'another-identifier'));
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(completions()).toHaveLength(1);
    const post = await inContext(() => posts.load(postId));
    expect(post?.version).toBe(2);
    expect(post?.isComplete()).toBe(true);
  });

  it('does not send back the event it received: the origin mark cuts the loop', async () => {
    const postId = PostId.generate();

    await deliver(postId, preCreatedFrom(postId));
    await until(() => completions().length === 1);

    expect(
      outbound
        .patterns()
        .filter((key) => key.startsWith('posts.PostPreCreated.')),
    ).toEqual([]);
  });

  it('drops its own echo instead of deciding twice about it', async () => {
    const postId = PostId.generate();
    const echo = preCreatedFrom(postId, `evt-${postId.value}`, {
      [TRANSPORT_ORIGIN]: 'tagging',
    });

    await deliver(postId, echo);
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(completions()).toHaveLength(0);
    expect(await inContext(() => posts.load(postId))).toBeNull();
  });

  it('carries the request the other service opened into its own decision', async () => {
    const postId = PostId.generate();

    await deliver(
      postId,
      preCreatedFrom(postId, `evt-${postId.value}`, {
        'cqrs-transport-correlation-id': 'c-1',
      }),
    );
    await until(() => completions().length === 1);

    expect(envelopeOf().metadata).toMatchObject({
      [TRANSPORT_ORIGIN]: 'tagging',
      'cqrs-transport-correlation-id': 'c-1',
    });
  });
});
