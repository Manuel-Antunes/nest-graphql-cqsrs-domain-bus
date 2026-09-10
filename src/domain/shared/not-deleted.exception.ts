/** Restaurar o que não está apagado. Pelo mesmo motivo do {@link AlreadyDeletedException}. */
export class NotDeletedException extends Error {
  constructor(readonly entity:unknown) {
    super(`não está apagado: ${String(entity)}`);
    this.name = 'NotDeletedException';
  }
}
