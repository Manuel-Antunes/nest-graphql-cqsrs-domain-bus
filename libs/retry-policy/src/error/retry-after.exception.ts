export class RetryAfterException extends Error {
  constructor(
    message: string,
    public readonly retryAfter: number | string | Date,
    options?: {
      cause?: unknown;
    },
  ) {
    super(message);
    this.name = 'RetryAfterException';
    if (options?.cause) {
      this.cause = options.cause;
    }
  }

  delayInMilliseconds(now: number = Date.now()): number {
    if (this.retryAfter instanceof Date) {
      return Math.max(0, this.retryAfter.getTime() - now);
    }
    const seconds =
      typeof this.retryAfter === 'number'
        ? this.retryAfter
        : Number.parseInt(String(this.retryAfter), 10);
    return Number.isNaN(seconds) ? 0 : Math.max(0, seconds * 1000);
  }
}
