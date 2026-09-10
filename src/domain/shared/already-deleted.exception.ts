/**
 * Apagar o que já está apagado.
 *
 * Recusar em vez de ignorar é a mesma regra do `update` sem mudanças e do `assignTag` repetido: se não
 * há fato novo, não há o que registrar — e num agregado que dispara eventos, aceitar em silêncio geraria
 * um evento que não muda nada.
 */
export class AlreadyDeletedException extends Error {
  constructor(readonly entity: unknown) {
    super(`já está apagado: ${String(entity)}`);
    this.name = 'AlreadyDeletedException';
  }
}
