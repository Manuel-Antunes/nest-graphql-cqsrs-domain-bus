/** Uma invariante da Tag foi violada. Vindo de um `safeParse`, o `ZodError` acompanha como `cause`. */
export class InvalidTagException extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'InvalidTagException';
  }
}
