import type { TagId } from '../vo/tag-id';

export class TagAlreadyExistsException extends Error {
  constructor(readonly tagId: TagId) {
    super(`tag ${tagId} já existe`);
    this.name = 'TagAlreadyExistsException';
  }
}
