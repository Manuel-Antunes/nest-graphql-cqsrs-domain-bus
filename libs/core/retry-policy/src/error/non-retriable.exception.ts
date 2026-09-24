export class NonRetriableException extends Error {
  constructor(
    message: string,
    options?: {
      cause?: unknown;
    },
  ) {
    super(message);
    this.name = 'NonRetriableException';
    if (options?.cause) {
      this.cause = options.cause;
    }
  }
}
