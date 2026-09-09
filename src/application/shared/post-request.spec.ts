import { AsyncContext, CommandBus } from '@nestjs/cqrs';
import type { TestingModule } from '@nestjs/testing';
import { createCqrsTestingModule, RecordingEvents } from '../../../test/support/cqrs-testing-module';
import { PostCreatedEvent } from '../../domain/post/event/post-created.event';
import { PostUpdatedEvent } from '../../domain/post/event/post-updated.event';
import { newPostId } from '../../domain/post/vo/post-id';
import { TagCreatedEvent } from '../../domain/tag/event/tag-created.event';
import { AssignTagToPostCommand } from '../post/command/assign-tag-to-post.command';
import { CreatePostCommand } from '../post/command/create-post.command';
import { AssignDefaultTagOnPostCreated } from '../post/event/assign-default-tag-on-post-created.saga';
import { CreateTagCommand } from '../tag/command/create-tag.command';
import { PostRequest } from './post-request';

/**
 * A propagação da request, montada de ponta a ponta: os quatro command handlers e a saga no mesmo
 * módulo, um `CreatePostCommand` despachado como o resolver o despacha, e a pergunta que dá nome ao
 * arquivo — **um pedido, quantas requests?**
 *
 * A cadeia tem três eventos e três handlers diferentes, dois deles despachados pela saga e nenhum
 * deles pela borda. Se a propagação funciona, os três eventos saem carimbados com o **mesmo objeto**,
 * e o `PostId` que a saga usa é o value object que a borda gerou — não um `parse` do payload.
 */
describe('PostRequest', () => {
  let module: TestingModule;
  let commands: CommandBus;
  let events: RecordingEvents;

  beforeEach(async () => {
    module = await createCqrsTestingModule([
      CreatePostCommand.Handler,
      AssignTagToPostCommand.Handler,
      CreateTagCommand.Handler,
      AssignDefaultTagOnPostCreated,
    ]);
    commands = module.get(CommandBus);
    events = new RecordingEvents(module);
  });

  afterEach(() => module.close());

  it('is the same object on every event of the chain the request opened', async () => {
    const postId = newPostId();
    const request = new PostRequest(postId);

    await commands.execute(new CreatePostCommand.CreatePost(postId, 'Nest + GraphQL', 'oi', 'manuel'), request);
    // PostCreated (o command), TagCreated e PostUpdated (a saga, depois)
    const [created, tagCreated, updated] = await events.waitFor(3);

    expect([created, tagCreated, updated].map((e) => e.constructor)).toEqual([
      PostCreatedEvent,
      TagCreatedEvent,
      PostUpdatedEvent,
    ]);
    expect(PostRequest.of(created)).toBe(request);
    expect(PostRequest.of(tagCreated)).toBe(request);
    expect(PostRequest.of(updated)).toBe(request);
    expect(PostRequest.of(updated)?.postId).toBe(postId);
  });

  it('carries the PostId as a value object, not as the primitive on the payload', async () => {
    const postId = newPostId();

    await commands.execute(new CreatePostCommand.CreatePost(postId, 'Nest + GraphQL', 'oi', 'manuel'), new PostRequest(postId));
    const [created] = await events.waitFor(1);

    // O payload é primitivo (contrato, atravessa processo); a chave anda por fora, já validada.
    expect((created as PostCreatedEvent).postId).toBe(postId as string);
    expect(PostRequest.of(created)?.postId).toBe(postId);
  });

  it('rides along as metadata: it does not show up in what the event compares as', async () => {
    const postId = newPostId();

    await commands.execute(new CreatePostCommand.CreatePost(postId, 'Nest + GraphQL', 'oi', 'manuel'), new PostRequest(postId));
    const [created] = await events.waitFor(1);

    expect(created).toEqual(new PostCreatedEvent(postId, 'Nest + GraphQL', 'oi', 'manuel', expect.any(Date)));
    expect(Object.keys(created as object)).toEqual(['postId', 'title', 'content', 'author', 'occurredAt']);
  });

  it('a command dispatched without one still runs — on the anonymous context the CommandBus creates', async () => {
    const postId = newPostId();

    await commands.execute(new CreatePostCommand.CreatePost(postId, 'sem request', 'oi', 'manuel'));
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
