import { z, type ZodError } from 'zod';

/** Uma invariante do Post foi violada: título vazio, update sem mudanças, tag repetida... */
export class InvalidPostException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidPostException';
  }

  /** Traduz as issues de um `safeParse` em uma mensagem só, campo a campo. */
  static fromZod(error: ZodError): InvalidPostException {
    return new InvalidPostException(z.prettifyError(error));
  }
}
