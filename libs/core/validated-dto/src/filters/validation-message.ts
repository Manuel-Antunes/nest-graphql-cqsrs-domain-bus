import { ZodError, z } from 'zod';

/**
 * **What a failed validation says**: the issues of the `ZodError` behind an exception, printed —
 * whether it is the exception itself or the cause a domain exception wraps it in — and otherwise the
 * exception's own message.
 */
export class ValidationMessage {
  static of(exception: Error): string {
    const zodError = ValidationMessage.zodErrorOf(exception);
    return zodError ? z.prettifyError(zodError) : exception.message;
  }

  private static zodErrorOf(exception: unknown): ZodError | undefined {
    if (exception instanceof ZodError) {
      return exception;
    }
    return exception instanceof Error && exception.cause !== undefined
      ? ValidationMessage.zodErrorOf(exception.cause)
      : undefined;
  }
}
