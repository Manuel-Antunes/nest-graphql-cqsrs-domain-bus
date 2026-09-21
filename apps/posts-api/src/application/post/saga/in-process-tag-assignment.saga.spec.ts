import type { TestingModule } from '@nestjs/testing';
import { firstValueFrom, of, toArray } from 'rxjs';
import { createCqrsTestingModule, inRequestContext } from '../../../../test/support/cqrs-testing-module';
import { PostPreCreatedEvent } from '@nestposts/posts/domain/post/event/post-pre-created.event';
import { PostId } from '@nestposts/posts/domain/post/vo/post-id';
import { DEFAULT_TAG_ID } from '@nestposts/posts/domain/tag/tag.entity';
import { TagId } from '@nestposts/posts/domain/tag/vo/tag-id';
import {
  EventEnvelope,
  TRANSPORT_IDENTIFIER,
  TRANSPORT_MESSAGE_TYPE,
  markIngested,
} from '@nestposts/transport-eventbus';
import { PostRequest } from '../../shared/post-request';
import { CompletePostCommand } from '../command/complete-post.command';
import { InProcessTagAssignment } from './in-process-tag-assignment.saga';

describe('InProcessTagAssignment', () => {
  let module: TestingModule;
  let saga: InProcessTagAssignment;

  const preCreated = (postId = PostId.generate()) =>
    new PostPreCreatedEvent(postId.value, 'Nest + GraphQL', 'oi', 'u1', 'manuel', new Date());

  const preCreatedIn = (request: PostRequest) => {
    const event = preCreated(request.postId);
    request.attachTo(event);
    return event;
  };

  const commandsFor = (...events: PostPreCreatedEvent[]) =>
    inRequestContext(module, () =>
      firstValueFrom(saga.completeTheCreation(of(...events)).pipe(toArray())),
    );

  beforeEach(async () => {
    module = await createCqrsTestingModule([InProcessTagAssignment]);
    saga = module.get(InProcessTagAssignment);
  });

  afterEach(() => module.close());

  it('completes the post with the default tag, whose id the domain decides', async () => {
    const event = preCreated();

    const commands = await commandsFor(event);

    expect(commands).toEqual([
      new CompletePostCommand.CompletePost(PostId.parse(event.postId), TagId.parse(DEFAULT_TAG_ID)),
    ]);
  });

  it('carries the request that created the post into the command it dispatches', async () => {
    const request = new PostRequest(PostId.generate());

    const [command] = await commandsFor(preCreatedIn(request));

    expect(PostRequest.of(command as object)).toBe(request);
  });

  it('opens a request of its own for a post created without one', async () => {
    const event = preCreated();

    const [command] = await commandsFor(event);

    expect(PostRequest.of(command as object)?.postId.value).toBe(event.postId);
  });

  it('completes each post of a batch, in order', async () => {
    const [first, second] = [preCreated(), preCreated()];

    const commands = await commandsFor(first, second);

    expect(commands.map((command) => (command as CompletePostCommand.CompletePost).postId.value)).toEqual([
      first.postId,
      second.postId,
    ]);
  });

  it('does not decide for a post another service pre-created: that decision is already on the wire', async () => {
    const event = preCreated();
    markIngested(
      event,
      new EventEnvelope(event, {
        [TRANSPORT_MESSAGE_TYPE]: 'posts.PostPreCreated#1.0.0',
        [TRANSPORT_IDENTIFIER]: 'evt-1',
      }),
    );

    await expect(commandsFor(event)).resolves.toEqual([]);
  });
});
