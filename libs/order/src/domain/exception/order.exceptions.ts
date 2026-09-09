import { z, type ZodError } from 'zod';

/** Uma invariante do pedido foi violada: valor inválido, chave malformada, transição impossível. */
export class InvalidOrderException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidOrderException';
  }

  static fromZod(error: ZodError): InvalidOrderException {
    return new InvalidOrderException(z.prettifyError(error));
  }
}

/** Pediram um pedido que não existe (ou ainda não chegou neste serviço). */
export class OrderNotFoundException extends Error {
  constructor(key: string) {
    super(`order ${key} não existe`);
    this.name = 'OrderNotFoundException';
  }
}
