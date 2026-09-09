import type { TestingModule } from '@nestjs/testing';
import { createCqrsTestingModule, freshEm, RecordingEvents } from '../../../../test/support/cqrs-testing-module';
import { givenATag } from '../../../../test/support/post-fixtures';
import { TagCreatedEvent } from '../../../domain/tag/event/tag-created.event';
import { InvalidTagException } from '../../../domain/tag/exception/invalid-tag.exception';
import { TagAlreadyExistsException } from '../../../domain/tag/exception/tag-already-exists.exception';
import { Tag } from '../../../domain/tag/tag.entity';
import { newTagId } from '../../../domain/tag/vo/tag-id';
import { CreateTagCommand } from './create-tag.command';
import { CreateTagCommandHandler } from './create-tag.handler';

describe('CreateTagCommandHandler', () => {
  let module: TestingModule;
  let handler: CreateTagCommandHandler;
  let events: RecordingEvents;

  beforeEach(async () => {
    module = await createCqrsTestingModule([CreateTagCommandHandler]);
    handler = module.get(CreateTagCommandHandler);
    events = new RecordingEvents(module);
  });

  afterEach(() => module.close());

  it('publishes TagCreated, saves the tag and returns the id', async () => {
    const id = newTagId();

    const result = await handler.execute(new CreateTagCommand(id, ' Untagged '));

    expect(result).toBe(id);
    expect(events.events).toEqual([new TagCreatedEvent(id, 'Untagged', expect.any(Date))]);
    expect(await freshEm(module).findOneOrFail(Tag, { id })).toMatchObject({ id, name: 'Untagged' });
  });

  it('rejects a blank name without saving anything', async () => {
    await expect(handler.execute(new CreateTagCommand(newTagId(), '  '))).rejects.toThrow(InvalidTagException);

    expect(events.events).toEqual([]);
    expect(await freshEm(module).count(Tag)).toBe(0);
  });

  it('rejects an id that already exists', async () => {
    const existing = await givenATag(module, 'dev');

    await expect(handler.execute(new CreateTagCommand(existing.id, 'outra'))).rejects.toThrow(TagAlreadyExistsException);
    expect(events.events).toEqual([]);
  });
});
