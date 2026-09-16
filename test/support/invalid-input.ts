import { z, ZodError } from 'zod';

/**
 * Roda `fn` e devolve, já impressas, as issues que a exceção de domínio trouxe como `cause`.
 *
 * As exceções de invariante não traduzem o `safeParse` que as originou: a mensagem delas nomeia a
 * invariante ("post inválido") e o `ZodError` vai pendurado na causa — quem decide como imprimi-lo é
 * a borda (o `DomainExceptionFilter`), e aqui, o teste. Assertar sobre a causa, e não sobre a
 * mensagem, é o que mantém o teste falando do campo recusado sem obrigar o domínio a carregar texto
 * de apresentação.
 */
export function issuesOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    const cause = error instanceof Error ? error.cause : undefined;
    if (cause instanceof ZodError) {
      return z.prettifyError(cause);
    }
    throw new Error(`esperava uma exceção com um ZodError na causa, veio: ${String(error)}`, { cause: error });
  }
  throw new Error('esperava uma exceção, e nada foi lançado');
}
