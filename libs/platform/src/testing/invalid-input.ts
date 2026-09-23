import { ZodError, z } from 'zod';

export function issuesOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    const cause = error instanceof Error ? error.cause : undefined;
    if (cause instanceof ZodError) {
      return z.prettifyError(cause);
    }
    throw new Error(
      `esperava uma exceção com um ZodError na causa, veio: ${String(error)}`,
      { cause: error },
    );
  }
  throw new Error('esperava uma exceção, e nada foi lançado');
}
