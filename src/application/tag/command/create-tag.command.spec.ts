import { CommandBus } from '@nestjs/cqrs';
import type { TestingModule } from '@nestjs/testing';
import { createCqrsTestingModule, freshEm, RecordingEvents, inRequestContext } from '../../../../test/support/cqrs-testing-module';
import { givenATag } from '../../../../test/support/post-fixtures';
import { PostId } from '../../../domain/post/vo/post-id';
import { TagCreatedEvent } from '../../../domain/tag/event/tag-created.event';
import { InvalidTagException } from '../../../domain/tag/exception/invalid-tag.exception';
import { TagAlreadyExistsException } from '../../../domain/tag/exception/tag-already-exists.exception';
import { Tag } from '../../../domain/tag/tag.entity';
import { TagId } from '../../../domain/tag/vo/tag-id';
import { TagName } from '../../../domain/tag/vo/tag-name';
import { PostRequest } from '../../shared/post-request';
import { CreateTagCommand } from './create-tag.command';

/**
 * Request-scoped como todo command handler daqui: o caminho do teste é o `CommandBus`. A request de
 * uma tag é a do post que a pediu — quem despacha este command em produção é a saga, repassando o
 * contexto que veio no `PostCreatedEvent`.
 */
describe('CreateTagCommand.Handler', () => {
  let module: TestingModule;
  let commands: CommandBus;
  let events: RecordingEvents;

  const execute = (command: CreateTagCommand.CreateTag) =>
    inRequestContext(module, () => commands.execute(command, new PostRequest(PostId.generate())));

  beforeEach(async () => {
    module = await createCqrsTestingModule([CreateTagCommand.Handler]);
    commands = module.get(CommandBus);
    events = new RecordingEvents(module);
  });

  afterEach(() => module.close());

  it('publishes TagCreated, saves the tag and returns the id', async () => {
    const id = TagId.generate();

    const result = await execute(new CreateTagCommand.CreateTag(id, ' Untagged '));

    expect(result.equals(id)).toBe(true);
    expect(events.events).toEqual([new TagCreatedEvent(id.value, 'Untagged', expect.any(Date))]);
    expect(await freshEm(module).findOneOrFail(Tag, { id })).toMatchObject({ id, name: TagName.parse('Untagged') });
  });

  it('rejects a blank name without saving anything', async () => {
    await expect(execute(new CreateTagCommand.CreateTag(TagId.generate(), '  '))).rejects.toThrow(InvalidTagException);

    expect(events.events).toEqual([]);
    expect(await freshEm(module).count(Tag)).toBe(0);
  });

  it('rejects an id that already exists', async () => {
    const existing = await givenATag(module, 'dev');

    await expect(execute(new CreateTagCommand.CreateTag(existing.id, 'outra'))).rejects.toThrow(TagAlreadyExistsException);
    expect(events.events).toEqual([]);
  });
});
