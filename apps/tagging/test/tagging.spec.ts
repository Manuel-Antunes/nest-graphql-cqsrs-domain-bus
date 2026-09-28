import { MikroORM } from '@mikro-orm/core';
import type { IEvent } from '@nestjs/cqrs';
import { EventBus } from '@nestjs/cqrs';
import type { NewOutboxMessage, OutboxEnvelope } from '@nestjs/outbox';
import { Test } from '@nestjs/testing';
import { inRequestContext, TENANT_MIGRATIONS } from '@nestposts/database';
import { migrate } from '@nestposts/migrator/main';
import { tenantMigrations } from '@nestposts/migrator/migrations/tenant/index';
import { MikroOrmOutboxStore } from '@nestposts/outbox-mikro-orm';
import { PostCreatedEvent } from '@nestposts/posts/domain/post/event/post-created.event';
import { PostPreCreatedEvent } from '@nestposts/posts/domain/post/event/post-pre-created.event';
import { Post } from '@nestposts/posts/domain/post/post.entity';
import { PostId } from '@nestposts/posts/domain/post/vo/post-id';
import {
  DEFAULT_TAG_ID,
  DEFAULT_TAG_NAME,
} from '@nestposts/posts/domain/tag/tag.entity';
import {
  EventIngestion,
  EventMessage,
  EventMessages,
  EventSourcingRepository,
  encodeData,
  LEGACY_CORRELATION_ID,
  TRANSPORT_MESSAGE_TYPE,
  TRANSPORT_ORIGIN,
  TRANSPORT_TAGS,
  TRANSPORT_TIMESTAMP,
} from '@nestposts/transport-eventbus';
import type { InProcessService } from '@nestposts/transport-eventbus/testing';
import { startInProcessService } from '@nestposts/transport-eventbus/testing';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';

import { AppModule } from '../src/app.module';
import { PostEventsClient } from '../src/infrastructure/transport/post-events.client';
import { until } from './support/until';

describe('the tagging service', () => {
  let tagging: InProcessService;
  let messages: EventMessages;
  let posts: EventSourcingRepository<Post>;
  let inbox: MikroOrmOutboxStore;
  const committed: IEvent[] = [];
  const destinations = new Set(PostEventsClient.namespaces);

  const authorId = UserId.generate();

  const preCreatedFrom = (
    postId: PostId,
    identifier = `evt-${postId.value}`,
    headers: Record<string, string> = {},
  ): OutboxEnvelope => ({
    id: identifier,
    topic: 'posts.PostPreCreated',
    key: `posts/${postId.value}`,
    createdAt: Date.parse('2026-09-08T12:00:00.000Z'),
    payload: encodeData(
      new PostPreCreatedEvent(
        postId.value,
        'Nest + GraphQL',
        'oi',
        authorId.value,
        'manuel',
        new Date('2026-09-08T12:00:00.000Z'),
      ),
    ),
    headers: {
      [TRANSPORT_MESSAGE_TYPE]: 'posts.PostPreCreated#1.0.0',
      [TRANSPORT_TIMESTAMP]: '2026-09-08T12:00:00.000Z',
      [TRANSPORT_ORIGIN]: 'posts-api',
      [TRANSPORT_TAGS]: `postId=${postId.value}`,
      ...headers,
    },
  });

  const deliver = (postId: PostId, envelope: OutboxEnvelope) =>
    tagging.server.emit(`posts.PostPreCreated.${postId.value}`, envelope);

  const inContext = <T>(work: () => Promise<T>): Promise<T> =>
    inRequestContext(tagging.app.get(MikroORM).em, work);

  const outboundOf = (event: IEvent): NewOutboxMessage | undefined =>
    messages.forDestination(EventMessage.of(event as object), destinations);

  const completions = () =>
    committed
      .filter((event) => event instanceof PostCreatedEvent)
      .flatMap((event) => outboundOf(event) ?? []);

  const envelopeOf = (index = 0): OutboxEnvelope => {
    const message = completions()[index];
    return {
      id: message.id ?? '',
      topic: message.topic,
      key: message.key ?? null,
      headers: { ...message.headers },
      createdAt: Date.now(),
      payload: message.payload,
    };
  };

  beforeAll(async () => {
    await migrate();
    tagging = await startInProcessService(
      await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(TENANT_MIGRATIONS)
        .useValue({ migrationsList: tenantMigrations })
        .compile(),
    );
    messages = tagging.app.get(EventMessages);
    posts = tagging.app.get(EventSourcingRepository);
    inbox = tagging.app.get(MikroOrmOutboxStore);
    tagging.app.get(EventBus).subscribe((event) => committed.push(event));
  });

  afterAll(() => tagging.close());

  beforeEach(() => {
    committed.length = 0;
  });

  it('binds its queue to the whole posts namespace: one entry for what it acts on and what it replicates', () => {
    expect(tagging.server.bindings()).toEqual(['posts.#']);
  });

  it('completes a post it was told was born, and publishes the decision', async () => {
    const postId = PostId.generate();

    await deliver(postId, preCreatedFrom(postId));
    await until(() => completions().length === 1);

    expect(completions()[0]).toMatchObject({
      topic: 'posts.PostCreated',
      key: `posts/${postId.value}`,
    });
    const event = EventMessages.read(envelopeOf()).payload;
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

  it('remembers the message it received under its own name, and who sent it', async () => {
    const postId = PostId.generate();

    await deliver(postId, preCreatedFrom(postId));
    await until(() => completions().length === 1);

    await expect(
      inbox.processedBy(tagging.app.get(EventIngestion).consumer),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          messageId: `evt-${postId.value}`,
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

  it('does not send back the event it received: the origin mark cuts the loop', async () => {
    const postId = PostId.generate();

    await deliver(postId, preCreatedFrom(postId));
    await until(() => completions().length === 1);

    const received = committed.filter(
      (event) => event instanceof PostPreCreatedEvent,
    );
    expect(received).toHaveLength(1);
    expect(received.map((event) => outboundOf(event))).toEqual([undefined]);
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

  it('carries the correlation of the request the other service opened into its own decision', async () => {
    const postId = PostId.generate();

    await deliver(
      postId,
      preCreatedFrom(postId, `evt-${postId.value}`, { correlationId: 'c-1' }),
    );
    await until(() => completions().length === 1);

    expect(envelopeOf().headers).toMatchObject({
      [TRANSPORT_ORIGIN]: 'tagging',
      correlationId: 'c-1',
    });
  });

  it('reads the correlation id a producer still wrote under its old key', async () => {
    const postId = PostId.generate();

    await deliver(
      postId,
      preCreatedFrom(postId, `evt-${postId.value}`, {
        [LEGACY_CORRELATION_ID]: 'c-legacy',
      }),
    );
    await until(() => completions().length === 1);

    expect(envelopeOf().headers).toMatchObject({ correlationId: 'c-legacy' });
    expect(envelopeOf().headers).not.toHaveProperty(LEGACY_CORRELATION_ID);
  });
});
