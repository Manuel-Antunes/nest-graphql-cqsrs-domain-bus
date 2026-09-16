export class NotDeletedException extends Error {
  constructor(readonly entity:unknown) {
    super(`não está apagado: ${String(entity)}`);
    this.name = 'NotDeletedException';
  }
}
