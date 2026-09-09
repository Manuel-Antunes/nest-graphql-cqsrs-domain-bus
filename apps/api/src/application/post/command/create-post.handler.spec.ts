import type { TestingModule } from '@nestjs/testing';
import { createCqrsTestingModule, freshEm, RecordingEvents } from '../../../../test/support/cqrs-testing-module';
import { givenAPost } from '../../../../test/support/post-fixtures';
import { PostCreatedEvent } from '../../../domain/post/event/post-created.event';
import { InvalidPostException } from '../../../domain/post/exception/invalid-post.exception';
import { PostAlreadyExistsException } from '../../../domain/post/exception/post-already-exists.exception';
import { Post } from '../../../domain/post/post.entity';
import { newPostId } from '../../../domain/post/vo/post-id';
import { CreatePostCommand } from './create-post.command';
import { CreatePostCommandHandler } from './create-post.handler';

describe('CreatePostCommandHandler', () => {
  let module: TestingModule;
  let handler: CreatePostCommandHandler;
  let events: RecordingEvents;

  beforeEach(async () => {
    module = await createCqrsTestingModule([CreatePostCommandHandler]);
    handler = module.get(CreatePostCommandHandler);
    events = new RecordingEvents(module);
  });

  afterEach(() => module.close());

  it('publishes PostCreated and returns the id', async () => {
    const id = newPostId();

    const result = await handler.execute(new CreatePostCommand(id, ' Nest + GraphQL ', 'oi', 'manuel'));

    expect(result).toBe(id);
    expect(events.events).toEqual([new PostCreatedEvent(id, 'Nest + GraphQL', 'oi', 'manuel', expect.any(Date))]);
  });

  it('saves the post within the command', async () => {
    const id = newPostId();
    await handler.execute(new CreatePostCommand(id, 'Nest + GraphQL', 'oi', 'manuel'));

    const saved = await freshEm(module).findOneOrFail(Post, { id });

    expect(saved).toMatchObject({ id, title: 'Nest + GraphQL', content: 'oi', author: 'manuel', version: 1, tags: [] });
    expect(saved.createdAt).toEqual(saved.updatedAt);
    expect(saved.getUncommittedEvents()).toEqual([]);
  });

  it('rejects a blank title without saving anything', async () => {
    const id = newPostId();

    await expect(handler.execute(new CreatePostCommand(id, '   ', 'oi', 'manuel'))).rejects.toThrow(InvalidPostException);

    expect(events.events).toEqual([]);
    expect(await freshEm(module).count(Post)).toBe(0);
  });

  it('rejects an id that already exists', async () => {
    const existing = await givenAPost(module);

    await expect(handler.execute(new CreatePostCommand(existing.id, 'outro', 'oi', 'manuel'))).rejects.toThrow(
      PostAlreadyExistsException,
    );

    expect(events.events).toEqual([]);
    expect(await freshEm(module).count(Post)).toBe(1);
  });
});
