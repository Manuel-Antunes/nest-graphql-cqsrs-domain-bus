/**
 * Uma invariante de User foi violada — email inválido, nome vazio, promoção impossível.
 *
 * Quando a violação vem de um `safeParse`, o `ZodError` viaja junto como `cause`: o domínio diz
 * **qual** invariante caiu, e quem precisa do detalhe campo a campo — o `DomainExceptionFilter` na
 * borda, o log — lê a causa. Traduzir o `ZodError` para texto aqui dentro faria o contrário: jogaria
 * fora as issues (que são dados) logo no ponto em que elas ainda estão inteiras, e amarraria o domínio
 * ao jeito que o Zod imprime.
 */
export class InvalidUserException extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'InvalidUserException';
  }
}
