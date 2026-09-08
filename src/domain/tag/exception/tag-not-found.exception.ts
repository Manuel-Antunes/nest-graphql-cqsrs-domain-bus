export class TagNotFoundException extends Error {
  constructor(readonly tagId: string) {
    super(`tag ${tagId} não existe`);
    this.name = 'TagNotFoundException';
  }
}
