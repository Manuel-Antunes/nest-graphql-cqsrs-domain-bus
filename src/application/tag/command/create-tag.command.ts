import { Command } from '@nestjs/cqrs';
import type { TagId } from '../../../domain/tag/vo/tag-id';

/** Command: criar uma Tag. Como no Post, o id vem de quem despacha. */
export class CreateTagCommand extends Command<TagId> {
  constructor(
    readonly tagId: TagId,
    readonly name: string,
  ) {
    super();
  }
}
