import type { ZodError } from 'zod';
import { z } from 'zod';

/** Uma invariante de User foi violada — email inválido, nome vazio, promoção impossível. */
export class InvalidUserException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidUserException';
  }

  static fromZod(error: ZodError): InvalidUserException {
    return new InvalidUserException(z.prettifyError(error));
  }
}
