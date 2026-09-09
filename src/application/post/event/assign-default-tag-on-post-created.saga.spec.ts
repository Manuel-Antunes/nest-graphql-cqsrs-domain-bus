import type { TestingModule } from '@nestjs/testing';
import { firstValueFrom, of, toArray } from 'rxjs';
import { createCqrsTestingModule, freshEm } from '../../../../test/support/cqrs-testing-module';
import { givenATag } from '../../../../test/support/post-fixtures';
import { PostCreatedEvent } from '../../../domain/post/event/post-created.event';
import { newPostId, PostId } from '../../../domain/post/vo/post-id';
import { Tag } from '../../../domain/tag/tag.entity';
import { TagName } from '../../../domain/tag/vo/tag-name';
import { TagRepository } from '../../../domain/tag/tag.repository';
import { PostRequest } from '../../shared/post-request';
import { CreateTagCommand } from '../../tag/command/create-tag.command';
import { AssignTagToPostCommand } from '../command/assign-tag-to-post.command';
import { AssignDefaultTagOnPostCreated } from './assign-default-tag-on-post-created.saga';

/**
 * A saga é uma função `Observable<evento> → Observable<command>`: dá para testá-la alimentando um
 * `of(evento)` e colhendo os commands, sem passar pelo `EventBus`. O `CreateTagCommand.Handler` entra
 * de verdade porque a saga o despacha pelo `CommandBus`.
 */
describe('AssignDefaultTagOnPostCreated', () => {
  let module: TestingModule;
  let saga: AssignDefaultTagOnPostCreated;

  const postCreated = () => new PostCreatedEvent(newPostId(), 'Nest + GraphQL', 'oi', 'manuel', new Date());
  /** O mesmo evento, como ele sai de um command handler: carimbado com a request que o pediu. */
  const postCreatedIn = (request: PostRequest) => {
    const event = new PostCreatedEvent(request.postId, 'Nest + GraphQL', 'oi', 'manuel', new Date());
    request.attachTo(event);
    return event;
  };
  const commandsFor = (...events: PostCreatedEvent[]) => firstValueFrom(saga.assignDefaultTag(of(...events)).pipe(toArray()));

  beforeEach(async () => {
    module = await createCqrsTestingModule([AssignDefaultTagOnPostCreated, CreateTagCommand.Handler]);
    saga = module.get(AssignDefaultTagOnPostCreated);
  });

  afterEach(() => module.close());

  it('creates the default tag when it does not exist and assigns it to the post', async () => {
    const event = postCreated();

    const commands = await commandsFor(event);

    const created = await freshEm(module).findOneOrFail(Tag, { name: TagName.parse('Untagged') });
    expect(commands).toEqual([new AssignTagToPostCommand.AssignTagToPost(PostId.parse(event.postId), created.id)]);
  });

  it('reuses the default tag when it already exists', async () => {
    const existing = await givenATag(module, 'Untagged');

    const commands = await commandsFor(postCreated());

    expect(commands).toEqual([new AssignTagToPostCommand.AssignTagToPost(expect.any(String), existing.id)]);
    expect(await freshEm(module).count(Tag)).toBe(1);
  });

  it('serializes the posts so two creations at once share one default tag', async () => {
    const [a, b] = [postCreated(), postCreated()];

    const commands = await commandsFor(a, b);

    expect(await freshEm(module).count(Tag)).toBe(1);
    expect(commands.map((c) => (c as AssignTagToPostCommand.AssignTagToPost).postId)).toEqual([a.postId, b.postId]);
  });

  it('ignores other events', async () => {
    expect(await firstValueFrom(saga.assignDefaultTag(of({ some: 'event' })).pipe(toArray()))).toEqual([]);
  });

  it('takes the PostId from the request that came with the event, not from the payload', async () => {
    const request = new PostRequest(newPostId());

    const [command] = (await commandsFor(postCreatedIn(request))) as AssignTagToPostCommand.AssignTagToPost[];

    // o mesmo value object que a borda gerou, e não um PostId.parse do primitivo do evento
    expect(command.postId).toBe(request.postId);
  });

  it('stamps the command it returns with that same request, so the chain continues in it', async () => {
    const request = new PostRequest(newPostId());

    const [command] = await commandsFor(postCreatedIn(request));

    expect(PostRequest.of(command as object)).toBe(request);
  });

  it('falls back to parsing the payload when the event arrives without a request', async () => {
    const event = postCreated();

    const [command] = (await commandsFor(event)) as AssignTagToPostCommand.AssignTagToPost[];

    expect(command.postId).toBe(PostId.parse(event.postId));
    expect(PostRequest.of(command as object)?.postId).toBe(PostId.parse(event.postId));
  });

  it('survives a failure on one post and keeps serving the next', async () => {
    const tags = module.get(TagRepository);
    const original = tags.findByName.bind(tags);
    let calls = 0;
    tags.findByName = async (name) => {
      if (calls++ === 0) {
        throw new Error('banco fora do ar');
      }
      return original(name);
    };
    const [failed, served] = [postCreated(), postCreated()];

    const commands = await commandsFor(failed, served);

    expect(commands).toEqual([new AssignTagToPostCommand.AssignTagToPost(PostId.parse(served.postId), expect.any(String))]);
  });
});
