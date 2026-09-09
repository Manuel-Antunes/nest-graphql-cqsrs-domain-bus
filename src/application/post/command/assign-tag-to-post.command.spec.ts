import { CommandBus } from '@nestjs/cqrs';
import type { TestingModule } from '@nestjs/testing';
import { createCqrsTestingModule, freshEm, RecordingEvents } from '../../../../test/support/cqrs-testing-module';
import { givenAPost, givenATag, T0 } from '../../../../test/support/post-fixtures';
import { PostUpdatedEvent } from '../../../domain/post/event/post-updated.event';
import { InvalidPostException } from '../../../domain/post/exception/invalid-post.exception';
import { PostNotFoundException } from '../../../domain/post/exception/post-not-found.exception';
import { Post } from '../../../domain/post/post.entity';
import { newPostId } from '../../../domain/post/vo/post-id';
import { TagNotFoundException } from '../../../domain/tag/exception/tag-not-found.exception';
import { newTagId } from '../../../domain/tag/vo/tag-id';
import { PostRequest } from '../../shared/post-request';
import { AssignTagToPostCommand } from './assign-tag-to-post.command';

/** Request-scoped como todo command handler daqui: o caminho do teste é o `CommandBus`. */
describe('AssignTagToPostCommand.Handler', () => {
  let module: TestingModule;
  let commands: CommandBus;
  let events: RecordingEvents;

  const execute = (command: AssignTagToPostCommand.AssignTagToPost) => commands.execute(command, new PostRequest(command.postId));

  beforeEach(async () => {
    module = await createCqrsTestingModule([AssignTagToPostCommand.Handler]);
    commands = module.get(CommandBus);
    events = new RecordingEvents(module);
  });

  afterEach(() => module.close());

  it('publishes PostUpdated with the tag and saves the post', async () => {
    const post = await givenAPost(module);
    const tag = await givenATag(module, 'Untagged');

    await execute(new AssignTagToPostCommand.AssignTagToPost(post.id, tag.id));

    const ref = { tagId: tag.id, name: 'Untagged' };
    expect(events.events).toEqual([
      new PostUpdatedEvent(post.id, 'Nest + GraphQL', 'oi', 'manuel', [ref], 2, T0, expect.any(Date)),
    ]);
    // a relação de verdade: a linha do pivô é o que prova que a tag ficou no post
    const saved = await freshEm(module).findOneOrFail(Post, { id: post.id }, { populate: ['tags'] });
    expect(saved.version).toBe(2);
    expect(saved.tags.getItems().map((t) => ({ tagId: t.id, name: t.name }))).toEqual([ref]);
  });

  it('adds a second tag without disturbing the first', async () => {
    const first = await givenATag(module, 'Untagged');
    const second = await givenATag(module, 'nestjs');
    const post = await givenAPost(module, { tags: [first] });

    await execute(new AssignTagToPostCommand.AssignTagToPost(post.id, second.id));

    // o diff do pivô tem que INSERIR só a nova linha — reinserir a antiga viola a unique do pivô
    const saved = await freshEm(module).findOneOrFail(Post, { id: post.id }, { populate: ['tags'] });
    expect(saved.tags.getItems().map((t) => t.name).sort()).toEqual(['Untagged', 'nestjs']);
    expect(saved.version).toBe(3);
  });

  it('rejects a tag the post already has', async () => {
    const tag = await givenATag(module, 'Untagged');
    const post = await givenAPost(module, { tags: [tag] });

    await expect(execute(new AssignTagToPostCommand.AssignTagToPost(post.id, tag.id))).rejects.toThrow(InvalidPostException);

    expect(events.events).toEqual([]);
    expect((await freshEm(module).findOneOrFail(Post, { id: post.id })).version).toBe(2);
  });

  it('fails with TagNotFound when the tag does not exist', async () => {
    const post = await givenAPost(module);

    await expect(execute(new AssignTagToPostCommand.AssignTagToPost(post.id, newTagId()))).rejects.toThrow(TagNotFoundException);
  });

  it('fails with PostNotFound when the post does not exist', async () => {
    const tag = await givenATag(module);

    await expect(execute(new AssignTagToPostCommand.AssignTagToPost(newPostId(), tag.id))).rejects.toThrow(PostNotFoundException);
  });
});
