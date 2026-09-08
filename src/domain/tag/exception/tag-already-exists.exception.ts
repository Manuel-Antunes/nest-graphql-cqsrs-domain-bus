export class TagAlreadyExistsException extends Error {
  constructor(readonly tagId: string) {
    super(`tag ${tagId} já existe`);
    this.name = 'TagAlreadyExistsException';
  }
}
