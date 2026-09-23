import type { TestingModule } from '@nestjs/testing';
import { PostCreatedEvent } from '@nestposts/posts/domain/post/event/post-created.event';
import { Post } from '@nestposts/posts/domain/post/post.entity';
import { PostId } from '@nestposts/posts/domain/post/vo/post-id';
import {
  DEFAULT_TAG_ID,
  DEFAULT_TAG_NAME,
  Tag,
} from '@nestposts/posts/domain/tag/tag.entity';
import { TagId } from '@nestposts/posts/domain/tag/vo/tag-id';
import {
  EventEnvelope,
  markIngested,
  TRANSPORT_IDENTIFIER,
  TRANSPORT_MESSAGE_TYPE,
  TRANSPORT_ORIGIN,
  TRANSPORT_TAGS,
  TRANSPORT_TIMESTAMP,
} from '@nestposts/transport-eventbus';
import { UserId } from '@nestposts/users/domain/user/vo/user-id';

import {
  createCqrsTestingModule,
  freshEm,
  inRequestContext,
} from '../../../../test/support/cqrs-testing-module';
import {
  givenAPost,
  givenTheDefaultTag,
} from '../../../../test/support/post-fixtures';
import { ProjectPostCompletion } from './project-post-completion.projection';

describe('ProjectPostCompletion', () => {
  let module: TestingModule;
  let projection: ProjectPostCompletion;

  const completionOf = (
    post: { id: PostId; author: { id: { value: string } } },
    tags: { tagId: string; name: string }[] = [
      { tagId: DEFAULT_TAG_ID, name: DEFAULT_TAG_NAME },
    ],
  ) =>
    new PostCreatedEvent(
      post.id.value,
      'Nest + GraphQL',
      'oi',
      post.author.id.value,
      tags,
      2,
      new Date('2026-09-08T12:05:00.000Z'),
    );

  const fromAnotherService = (event: PostCreatedEvent) => {
    markIngested(
      event,
      new EventEnvelope(event, {
        [TRANSPORT_MESSAGE_TYPE]: 'posts.PostCreated#2.0.0',
        [TRANSPORT_IDENTIFIER]: 'evt-1',
        [TRANSPORT_TIMESTAMP]: event.occurredAt.toISOString(),
        [TRANSPORT_ORIGIN]: 'tagging',
        [TRANSPORT_TAGS]: `postId=${event.postId}`,
      }),
    );
    return event;
  };

  const reload = (postId: PostId) =>
    inRequestContext(module, () =>
      freshEm(module).findOneOrFail(
        Post,
        { id: postId },
        { populate: ['tags'] },
      ),
    );

  beforeEach(async () => {
    module = await createCqrsTestingModule([ProjectPostCompletion]);
    projection = module.get(ProjectPostCompletion);
  });

  afterEach(() => module.close());

  it('writes the completion another service decided into the read model', async () => {
    await givenTheDefaultTag(module);
    const post = await givenAPost(module);

    await projection.handle(fromAnotherService(completionOf(post)));

    const saved = await reload(post.id);
    expect(saved.version).toBe(2);
    expect(saved.isComplete()).toBe(true);
    expect(saved.tags.getIdentifiers().map(String)).toEqual([DEFAULT_TAG_ID]);
  });

  it('ignores an event this service raised itself: the command already wrote the row', async () => {
    const post = await givenAPost(module);

    await projection.handle(completionOf(post));

    expect((await reload(post.id)).isComplete()).toBe(false);
  });

  it('is idempotent: a redelivered decision does not move the post again', async () => {
    await givenTheDefaultTag(module);
    const post = await givenAPost(module);
    await projection.handle(fromAnotherService(completionOf(post)));

    await projection.handle(fromAnotherService(completionOf(post)));

    const saved = await reload(post.id);
    expect(saved.version).toBe(2);
    expect(saved.tags.getIdentifiers()).toHaveLength(1);
  });

  it('records a tag it does not have from the decision itself, which is why the name travels', async () => {
    const post = await givenAPost(module);
    const unknown = TagId.generate();

    await projection.handle(
      fromAnotherService(
        completionOf(post, [{ tagId: unknown.value, name: 'decidida lá' }]),
      ),
    );

    const tag = await inRequestContext(module, () =>
      freshEm(module).findOneOrFail(Tag, { id: unknown }),
    );
    expect(tag.name.value).toBe('decidida lá');
    expect((await reload(post.id)).tags.getIdentifiers().map(String)).toEqual([
      unknown.value,
    ]);
  });

  it('says so and moves on when the post is not here at all', async () => {
    const absent = PostId.generate();

    await expect(
      projection.handle(
        fromAnotherService(
          new PostCreatedEvent(
            absent.value,
            't',
            'c',
            UserId.generate().value,
            [],
            2,
            new Date(),
          ),
        ),
      ),
    ).resolves.toBeUndefined();
  });
});
