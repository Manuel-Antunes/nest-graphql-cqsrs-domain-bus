/**
 * Uma invariante do Post foi violada: título vazio, update sem mudanças, tag repetida...
 *
 * Quando a violação vem de um `safeParse`, o `ZodError` vai como `cause` — a mensagem nomeia a
 * invariante, a causa carrega as issues. Quem imprime uma coisa ou outra é a borda.
 */
export class InvalidPostException extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'InvalidPostException';
  }
}
