import { z, type ZodError } from 'zod';

export class InvalidTagException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTagException';
  }

  static fromZod(error: ZodError): InvalidTagException {
    return new InvalidTagException(z.prettifyError(error));
  }
}
