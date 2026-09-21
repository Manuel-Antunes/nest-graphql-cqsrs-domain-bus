import type { TagId } from '../vo/tag-id';

export class TagNotFoundException extends Error {
  constructor(readonly tagId: TagId) {
    super(`tag ${tagId} não existe`);
    this.name = 'TagNotFoundException';
  }
}
