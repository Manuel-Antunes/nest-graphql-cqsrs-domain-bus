export class AlreadyDeletedException extends Error {
  constructor(readonly entity: unknown) {
    super(`já está apagado: ${String(entity)}`);
    this.name = 'AlreadyDeletedException';
  }
}
